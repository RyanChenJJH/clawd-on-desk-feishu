"use strict";

// "Health Reminder" settings tab (fork extension). Lets the user manage reminder
// definitions (time + text + animation), the master switch, DND respect, and a
// quiet-hours window. All writes go through the healthReminder.* commands so the
// prefs controller/store stays the single source of truth.
//
// Tab content uses a local bilingual helper (zh / en) rather than new i18n keys
// so the fork doesn't have to extend the parity-checked settings-i18n for every
// language; only the sidebar label lives in settings-i18n.

(function initSettingsTabHealthReminder(root) {
  let helpers = null;
  let state = null;
  let ops = null;
  let readers = null;

  // editing form state: null = none, "new" = adding, or a reminder id
  let editing = null;
  let draft = null;

  const ANIMATION_KEYS = ["none", "drink", "stretch", "eat", "offwork", "eyerest", "breathe", "posture", "walk", "snack", "sleeptime"];
  const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
  // Mirror of src/health-reminder/presets.js ids (browser IIFE can't require it).
  // A drift guard test asserts every preset id appears in this file.
  const TEMPLATES = [
    { id: "water", zh: "喝水", en: "Drink water" },
    { id: "stand", zh: "久坐起身", en: "Stand & stretch" },
    { id: "eyerest", zh: "护眼远眺", en: "Eye rest" },
    { id: "breathe", zh: "深呼吸", en: "Deep breathing" },
    { id: "pomodoro", zh: "番茄钟休息", en: "Pomodoro break" },
    { id: "lunch", zh: "午饭时间", en: "Lunch time" },
    { id: "offwork", zh: "下班提醒", en: "Off work" },
    { id: "sleeptime", zh: "该睡觉了", en: "Bedtime" },
  ];
  // Sound names declared by every built-in theme's `sounds` block (+ "none").
  const SOUND_OPTIONS = [
    { id: "", zh: "无", en: "None" },
    { id: "complete", zh: "完成提示", en: "Complete" },
    { id: "confirm", zh: "权限提示", en: "Confirm" },
  ];

  function lang() {
    try { return readers && readers.getLang ? readers.getLang() : "en"; } catch { return "en"; }
  }
  function L(zh, en) { return String(lang()).startsWith("zh") ? zh : en; }
  function animLabel(key) {
    const map = {
      none: L("仅文字气泡", "Bubble only"),
      drink: L("喝水", "Drink water"),
      stretch: L("起身伸展", "Stand & stretch"),
      eat: L("吃饭时间", "Meal time"),
      offwork: L("下班", "Off work"),
      eyerest: L("护眼远眺", "Eye rest"),
      breathe: L("深呼吸", "Deep breathing"),
      posture: L("端正坐姿", "Sit up straight"),
      walk: L("走动一下", "Take a walk"),
      snack: L("吃点水果", "Healthy snack"),
      sleeptime: L("该睡觉了", "Bedtime"),
    };
    return map[key] || key;
  }
  function weekdayLabel(d) {
    return [L("日", "Su"), L("一", "Mo"), L("二", "Tu"), L("三", "We"), L("四", "Th"), L("五", "Fr"), L("六", "Sa")][d];
  }

  function cfg() {
    const c = state && state.snapshot && state.snapshot.healthReminder;
    return c || { enabled: false, respectDnd: true, quietHours: { enabled: false, start: "22:00", end: "08:00" }, autoCollapseMinutes: 0, reminders: [] };
  }
  function command(name, payload) {
    if (!window.settingsAPI || typeof window.settingsAPI.command !== "function") return Promise.resolve({ status: "error" });
    return window.settingsAPI.command(name, payload).then((res) => {
      if (res && res.status === "error" && ops && ops.showToast) ops.showToast(res.message || "Health reminder action failed", { error: true });
      return res;
    });
  }
  function scheduleSummary(r) {
    const s = r.schedule || {};
    const dayPart = (Array.isArray(s.days) && s.days.length && s.days.length < 7)
      ? " · " + s.days.map(weekdayLabel).join("")
      : "";
    if (s.type === "daily") return (s.times || []).join(", ") + dayPart;
    return L(`每 ${s.intervalMinutes} 分钟`, `every ${s.intervalMinutes} min`) + dayPart;
  }

  function row(labelText, control) {
    const r = document.createElement("div");
    r.className = "hr-row";
    const l = document.createElement("label");
    l.className = "hr-row-label";
    l.textContent = labelText;
    r.appendChild(l);
    r.appendChild(control);
    return r;
  }
  function checkbox(checked, onChange) {
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = !!checked;
    c.addEventListener("change", () => onChange(c.checked));
    return c;
  }
  function textInput(value, onChange, opts = {}) {
    const i = document.createElement("input");
    i.type = opts.type || "text";
    i.value = value == null ? "" : value;
    if (opts.placeholder) i.placeholder = opts.placeholder;
    if (opts.width) i.style.width = opts.width;
    i.addEventListener("input", () => onChange(i.value));
    return i;
  }
  function button(text, onClick, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls || "soft-btn";
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  function textarea(value, opts = {}) {
    const t = document.createElement("textarea");
    t.className = "hr-exchange";
    t.value = value == null ? "" : value;
    if (opts.placeholder) t.placeholder = opts.placeholder;
    t.rows = opts.rows || 4;
    t.style.width = "100%";
    return t;
  }

  // V2-P3: one-click add from a built-in template + portable JSON import/export.
  function buildTemplates(section) {
    const tsel = document.createElement("select");
    for (const tpl of TEMPLATES) {
      const o = document.createElement("option");
      o.value = tpl.id;
      o.textContent = L(tpl.zh, tpl.en);
      tsel.appendChild(o);
    }
    const addWrap = document.createElement("div");
    addWrap.className = "hr-inline";
    addWrap.appendChild(tsel);
    addWrap.appendChild(button(L("从模板添加", "Add from template"), () => {
      command("healthReminder.addFromTemplate", { templateId: tsel.value, lang: lang() }).then((res) => {
        if (res && res.status === "ok" && ops) ops.requestRender({ content: true });
      });
    }, "soft-btn accent"));
    section.appendChild(row(L("模板", "Templates"), addWrap));

    const box = textarea("", {
      rows: 4,
      placeholder: L("导出的提醒 JSON 会出现在这里；粘贴 JSON 后点“导入”。",
        "Exported reminder JSON appears here; paste JSON then click Import."),
    });
    const ioWrap = document.createElement("div");
    ioWrap.className = "hr-inline";
    ioWrap.appendChild(button(L("导出全部", "Export all"), () => {
      command("healthReminder.exportReminders", {}).then((res) => {
        if (res && res.status === "ok" && res.data) {
          box.value = JSON.stringify(res.data, null, 2);
          box.focus();
          box.select();
          if (ops && ops.showToast) ops.showToast(L("已生成，可复制保存", "Generated — copy to save"));
        }
      });
    }));
    ioWrap.appendChild(button(L("导入", "Import"), () => {
      let parsed;
      try {
        parsed = JSON.parse(box.value);
      } catch (e) {
        if (ops && ops.showToast) ops.showToast(L("JSON 解析失败", "Invalid JSON"), { error: true });
        return;
      }
      command("healthReminder.importReminders", { data: parsed, mode: "merge" }).then((res) => {
        if (res && res.status === "ok") {
          if (ops && ops.showToast) ops.showToast(L(`已导入 ${res.imported} 条`, `Imported ${res.imported}`));
          if (ops) ops.requestRender({ content: true });
        }
      });
    }));
    section.appendChild(row(L("导入/导出", "Import / Export"), ioWrap));
    section.appendChild(box);
  }

  function startEdit(reminder) {
    editing = reminder ? reminder.id : "new";
    draft = reminder
      ? JSON.parse(JSON.stringify(reminder))
      : { label: "", message: "", animationKey: "drink", snoozeMinutes: 10, schedule: { type: "interval", intervalMinutes: 45, times: ["12:00"], days: [] } };
    if (ops) ops.requestRender({ content: true });
  }
  function cancelEdit() {
    editing = null; draft = null;
    if (ops) ops.requestRender({ content: true });
  }
  function saveEdit() {
    const reminder = draft;
    const payload = editing === "new"
      ? { reminder }
      : { id: editing, patch: reminder };
    const name = editing === "new" ? "healthReminder.addReminder" : "healthReminder.updateReminder";
    command(name, payload).then((res) => {
      if (res && (res.status === "ok")) { editing = null; draft = null; if (ops) ops.requestRender({ content: true }); }
    });
  }

  function buildGlobals(section) {
    const c = cfg();
    section.appendChild(row(
      L("启用健康提醒", "Enable health reminders"),
      checkbox(c.enabled, (v) => command("healthReminder.setEnabled", { enabled: v }))
    ));

    // v3: global display mode — follow the pet, or pin to the screen's corner.
    const modeSel = document.createElement("select");
    [["followPet", L("跟随宠物", "Follow the pet")], ["corner", L("屏幕右下角", "Screen bottom-right")]]
      .forEach(([val, text]) => {
        const o = document.createElement("option");
        o.value = val;
        o.textContent = text;
        if ((c.displayMode || "followPet") === val) o.selected = true;
        modeSel.appendChild(o);
      });
    modeSel.addEventListener("change", () => command("healthReminder.setDisplayMode", { mode: modeSel.value }));
    section.appendChild(row(L("显示模式", "Display mode"), modeSel));

    section.appendChild(row(
      L("尊重勿扰(DND)", "Respect Do Not Disturb"),
      checkbox(c.respectDnd, (v) => command("healthReminder.setRespectDnd", { respectDnd: v }))
    ));

    const q = c.quietHours || {};
    const quietWrap = document.createElement("div");
    quietWrap.className = "hr-inline";
    quietWrap.appendChild(checkbox(q.enabled, (v) => command("healthReminder.setQuietHours", { quietHours: { ...q, enabled: v } })));
    const start = textInput(q.start || "22:00", (v) => { q.start = v; }, { width: "64px", placeholder: "22:00" });
    const end = textInput(q.end || "08:00", (v) => { q.end = v; }, { width: "64px", placeholder: "08:00" });
    const apply = button(L("应用", "Apply"), () => command("healthReminder.setQuietHours", { quietHours: { enabled: q.enabled !== false, start: start.value, end: end.value } }));
    quietWrap.appendChild(document.createTextNode(" "));
    quietWrap.appendChild(start);
    quietWrap.appendChild(document.createTextNode(" – "));
    quietWrap.appendChild(end);
    quietWrap.appendChild(apply);
    section.appendChild(row(L("静默时段", "Quiet hours"), quietWrap));

    // V2-P5 smart scheduling (opt-in, default off).
    section.appendChild(row(
      L("仅在使用电脑时提醒", "Only remind when active"),
      checkbox(c.onlyWhenActive === true, (v) => command("healthReminder.setSmartOptions", { onlyWhenActive: v }))
    ));
    section.appendChild(row(
      L("连续“稍后”自动延长间隔", "Stretch interval after snoozes"),
      checkbox(c.adaptiveInterval === true, (v) => command("healthReminder.setSmartOptions", { adaptiveInterval: v }))
    ));
    section.appendChild(row(
      L("静默时段错过的提醒顺延", "Defer misses past quiet hours"),
      checkbox(c.deferPastQuietHours === true, (v) => command("healthReminder.setSmartOptions", { deferPastQuietHours: v }))
    ));
    section.appendChild(row(
      L("减少动态(不播身体动画)", "Reduce motion (no body animation)"),
      checkbox(c.reduceMotion === true, (v) => command("healthReminder.setSmartOptions", { reduceMotion: v }))
    ));

    // V2-P6 bubble UX: configurable stack cap + dismiss-all.
    const maxWrap = document.createElement("div");
    maxWrap.className = "hr-inline";
    const maxInput = textInput(c.maxVisibleBubbles == null ? 3 : c.maxVisibleBubbles, () => {}, { type: "number", width: "60px" });
    maxWrap.appendChild(maxInput);
    maxWrap.appendChild(button(L("应用", "Apply"), () => command("healthReminder.setMaxVisibleBubbles", { value: Number(maxInput.value) || 3 })));
    section.appendChild(row(L("最多同时显示气泡(1–5)", "Max bubbles shown (1–5)"), maxWrap));

    section.appendChild(row(
      L("全部知道了", "Dismiss all"),
      button(L("清空所有健康气泡", "Clear all health bubbles"), () => command("healthReminder.dismissAll"))
    ));

    // V2-P7 opt-in local stats (strictly local; never exported or sent anywhere).
    section.appendChild(row(
      L("记录本地统计", "Record local stats"),
      checkbox(c.statsEnabled === true, (v) => command("healthReminder.setStatsEnabled", { enabled: v }))
    ));
    if (c.statsEnabled) {
      const st = c.stats || { fired: 0, confirmed: 0, snoozed: 0 };
      const statsWrap = document.createElement("div");
      statsWrap.className = "hr-inline";
      const summary = document.createElement("span");
      summary.className = "settings-tab-desc";
      summary.textContent = L(
        `触发 ${st.fired} · 知道了 ${st.confirmed} · 稍后 ${st.snoozed}`,
        `Fired ${st.fired} · Confirmed ${st.confirmed} · Snoozed ${st.snoozed}`
      );
      statsWrap.appendChild(summary);
      statsWrap.appendChild(document.createTextNode("  "));
      statsWrap.appendChild(button(L("清空统计", "Clear stats"), () => command("healthReminder.clearStats")));
      section.appendChild(row(L("统计", "Stats"), statsWrap));
    }
  }

  function buildReminderList(section) {
    const c = cfg();
    const list = document.createElement("div");
    list.className = "hr-list";
    if (!c.reminders.length) {
      const empty = document.createElement("p");
      empty.className = "settings-tab-desc";
      empty.textContent = L("还没有提醒，点下方“新增提醒”。", "No reminders yet — add one below.");
      list.appendChild(empty);
    }
    for (const r of c.reminders) {
      const card = document.createElement("div");
      card.className = "hr-card";
      const head = document.createElement("div");
      head.className = "hr-card-head";
      head.appendChild(checkbox(r.enabled !== false, (v) => command("healthReminder.updateReminder", { id: r.id, patch: { ...r, enabled: v } })));
      const titleWrap = document.createElement("div");
      titleWrap.className = "hr-card-title";
      const name = document.createElement("div");
      name.className = "hr-card-name";
      name.textContent = r.label || L("(未命名)", "(unnamed)");
      const meta = document.createElement("div");
      meta.className = "hr-card-meta";
      meta.textContent = scheduleSummary(r) + " · " + animLabel(r.animationKey);
      titleWrap.appendChild(name);
      titleWrap.appendChild(meta);
      head.appendChild(titleWrap);
      card.appendChild(head);

      const actions = document.createElement("div");
      actions.className = "hr-card-actions";
      actions.appendChild(button(L("测试", "Test"), () => command("healthReminder.testReminder", { id: r.id })));
      actions.appendChild(button(L("编辑", "Edit"), () => startEdit(r)));
      actions.appendChild(button(L("删除", "Delete"), () => command("healthReminder.removeReminder", { id: r.id }), "soft-btn"));
      card.appendChild(actions);
      list.appendChild(card);
    }
    section.appendChild(list);
    section.appendChild(button(L("+ 新增提醒", "+ Add reminder"), () => startEdit(null), "soft-btn accent"));
  }

  function buildEditForm(section) {
    const d = draft;
    const form = document.createElement("div");
    form.className = "hr-form";
    const s = d.schedule;

    form.appendChild(row(L("名称", "Label"), textInput(d.label, (v) => { d.label = v; }, { placeholder: L("喝水", "Drink water") })));
    form.appendChild(row(L("提醒文字", "Message"), textInput(d.message, (v) => { d.message = v; }, { placeholder: L("该喝水啦 💧", "Time to drink water 💧") })));

    const typeSel = document.createElement("select");
    for (const [val, label] of [["interval", L("循环间隔", "Interval")], ["daily", L("固定时刻", "Daily time")]]) {
      const o = document.createElement("option"); o.value = val; o.textContent = label; if (s.type === val) o.selected = true; typeSel.appendChild(o);
    }
    typeSel.addEventListener("change", () => { s.type = typeSel.value; if (ops) ops.requestRender({ content: true }); });
    form.appendChild(row(L("调度方式", "Schedule"), typeSel));

    if (s.type === "daily") {
      form.appendChild(row(L("时刻(逗号分隔)", "Times (comma)"), textInput((s.times || []).join(", "), (v) => { s.times = v.split(",").map((x) => x.trim()).filter(Boolean); }, { placeholder: "12:00, 18:30" })));
    } else {
      form.appendChild(row(L("间隔(分钟)", "Interval (min)"), textInput(s.intervalMinutes, (v) => { s.intervalMinutes = Number(v) || 0; }, { type: "number", width: "80px" })));
    }

    const daysWrap = document.createElement("div");
    daysWrap.className = "hr-days";
    for (const d7 of WEEKDAYS) {
      const lbl = document.createElement("label");
      lbl.className = "hr-day";
      const cb = checkbox((s.days || []).includes(d7), (v) => {
        const set = new Set(s.days || []);
        if (v) set.add(d7); else set.delete(d7);
        s.days = [...set].sort((a, b) => a - b);
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(weekdayLabel(d7)));
      daysWrap.appendChild(lbl);
    }
    form.appendChild(row(L("生效星期(空=每天)", "Days (empty = all)"), daysWrap));

    const animSel = document.createElement("select");
    for (const k of ANIMATION_KEYS) {
      const o = document.createElement("option"); o.value = k; o.textContent = animLabel(k); if (d.animationKey === k) o.selected = true; animSel.appendChild(o);
    }
    animSel.addEventListener("change", () => { d.animationKey = animSel.value; });
    form.appendChild(row(L("动画", "Animation"), animSel));

    const soundWrap = document.createElement("div");
    soundWrap.className = "hr-inline";
    const soundSel = document.createElement("select");
    for (const opt of SOUND_OPTIONS) {
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = L(opt.zh, opt.en);
      if ((d.sound || "") === opt.id) o.selected = true;
      soundSel.appendChild(o);
    }
    soundSel.addEventListener("change", () => { d.sound = soundSel.value || null; });
    soundWrap.appendChild(soundSel);
    soundWrap.appendChild(button(L("试听", "Preview"), () => {
      const name = soundSel.value;
      if (!name) { if (ops && ops.showToast) ops.showToast(L("未选择提醒音", "No sound selected")); return; }
      if (window.settingsAPI && typeof window.settingsAPI.previewSound === "function") {
        window.settingsAPI.previewSound({ soundName: name }).then((res) => {
          if (res && res.status === "skipped" && ops && ops.showToast) ops.showToast(L("勿扰/静音中，已跳过试听", "Skipped (DND / muted)"));
        });
      }
    }));
    form.appendChild(row(L("提醒音", "Sound"), soundWrap));

    form.appendChild(row(L("稍后(分钟)", "Snooze (min)"), textInput(d.snoozeMinutes, (v) => { d.snoozeMinutes = Number(v) || 10; }, { type: "number", width: "80px" })));

    const formActions = document.createElement("div");
    formActions.className = "hr-card-actions";
    formActions.appendChild(button(L("保存", "Save"), saveEdit, "soft-btn accent"));
    formActions.appendChild(button(L("取消", "Cancel"), cancelEdit));
    form.appendChild(formActions);

    section.appendChild(form);
  }

  function render(container, core) {
    helpers = core.helpers; state = core.state; ops = core.ops; readers = core.readers;

    const h1 = document.createElement("h1");
    h1.textContent = L("健康提醒", "Health Reminders");
    container.appendChild(h1);
    const sub = document.createElement("p");
    sub.className = "subtitle";
    sub.textContent = L("设置喝水、久坐起身、午饭、下班等桌面提醒。提醒会独立显示，不打断任务。",
      "Desktop nudges for water, stretching, lunch, off-work, and more — shown independently so they never interrupt a task.");
    container.appendChild(sub);

    const globals = document.createElement("div");
    globals.className = "settings-tab-section";
    buildGlobals(globals);
    container.appendChild(globals);

    if (!editing) {
      const tplSection = document.createElement("div");
      tplSection.className = "settings-tab-section";
      buildTemplates(tplSection);
      container.appendChild(tplSection);
    }

    const listSection = document.createElement("div");
    listSection.className = "settings-tab-section";
    if (editing) buildEditForm(listSection);
    else buildReminderList(listSection);
    container.appendChild(listSection);
  }

  function init(core) {
    core.tabs["healthReminder"] = { render };
  }

  root.ClawdSettingsTabHealthReminder = { init };
})(globalThis);
