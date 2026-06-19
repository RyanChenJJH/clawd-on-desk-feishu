"use strict";

// V2-P3: portable reminder import/export + built-in preset templates.
// Pure logic over the normalized healthReminder config — no store/controller.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const fs = require("fs");
const path = require("path");

const hrSettings = require("../src/health-reminder-settings");
const presets = require("../src/health-reminder/presets");
const { normalizeConfig } = require("../src/health-reminder/reminder-model");

function configWith(reminders) {
  return normalizeConfig({ enabled: true, reminders });
}

describe("exportReminders", () => {
  it("produces a portable envelope without internal ids", () => {
    const cfg = configWith([
      { label: "喝水", message: "drink", animationKey: "drink", schedule: { type: "interval", intervalMinutes: 45 }, snoozeMinutes: 10 },
    ]);
    const out = hrSettings.exportReminders(cfg);
    assert.equal(out.kind, "clawd-health-reminders");
    assert.equal(typeof out.version, "number");
    assert.equal(out.reminders.length, 1);
    assert.equal(out.reminders[0].label, "喝水");
    assert.equal(out.reminders[0].animationKey, "drink");
    assert.ok(!("id" in out.reminders[0]), "exported reminder must not leak internal id");
  });
});

describe("importReminders", () => {
  it("merge appends incoming reminders with fresh ids (no collision)", () => {
    const cfg = configWith([
      { id: "hr_existing", label: "A", schedule: { type: "interval", intervalMinutes: 30 } },
    ]);
    const payload = {
      kind: "clawd-health-reminders",
      version: 1,
      reminders: [
        { id: "hr_existing", label: "B", schedule: { type: "interval", intervalMinutes: 60 } },
      ],
    };
    const res = hrSettings.importReminders(cfg, payload, { mode: "merge" });
    assert.equal(res.ok, true);
    assert.equal(res.config.reminders.length, 2);
    const ids = res.config.reminders.map((r) => r.id);
    assert.equal(new Set(ids).size, 2, "imported reminder must get a fresh id");
    assert.deepEqual(res.config.reminders.map((r) => r.label), ["A", "B"]);
  });

  it("replace swaps the whole set", () => {
    const cfg = configWith([{ label: "old", schedule: { type: "interval", intervalMinutes: 30 } }]);
    const res = hrSettings.importReminders(
      cfg,
      { reminders: [{ label: "new", schedule: { type: "interval", intervalMinutes: 90 } }] },
      { mode: "replace" }
    );
    assert.equal(res.ok, true);
    assert.deepEqual(res.config.reminders.map((r) => r.label), ["new"]);
  });

  it("accepts a bare array payload", () => {
    const cfg = configWith([]);
    const res = hrSettings.importReminders(cfg, [
      { label: "x", schedule: { type: "interval", intervalMinutes: 15 } },
    ]);
    assert.equal(res.ok, true);
    assert.equal(res.config.reminders.length, 1);
  });

  it("rejects a malformed payload (no reminders array)", () => {
    const cfg = configWith([]);
    const res = hrSettings.importReminders(cfg, { nope: true });
    assert.equal(res.ok, false);
    assert.match(res.error, /reminders/i);
  });

  it("rejects when any reminder is invalid (daily with no times)", () => {
    const cfg = configWith([]);
    const res = hrSettings.importReminders(cfg, {
      reminders: [{ label: "bad", schedule: { type: "daily", times: [] } }],
    });
    assert.equal(res.ok, false);
    assert.equal(cfg.reminders.length, 0);
  });
});

describe("presets", () => {
  it("lists built-in templates with stable ids + animation keys", () => {
    const list = presets.listPresets();
    assert.ok(Array.isArray(list) && list.length >= 5);
    for (const p of list) {
      assert.equal(typeof p.id, "string");
      assert.ok(p.id.length > 0);
      assert.equal(typeof p.animationKey, "string");
    }
    // ids are unique
    const ids = list.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("buildFromPreset returns a valid reminder def for a known id", () => {
    const list = presets.listPresets();
    const def = presets.buildFromPreset(list[0].id, "zh");
    assert.ok(def);
    assert.equal(hrSettings.validateReminder(def).ok, true);
    assert.equal(typeof def.label, "string");
    assert.ok(def.label.length > 0);
  });

  it("buildFromPreset returns null for an unknown id", () => {
    assert.equal(presets.buildFromPreset("does-not-exist", "en"), null);
  });

  it("settings tab TEMPLATES list references every preset id (drift guard)", () => {
    const tabSrc = fs.readFileSync(
      path.join(__dirname, "..", "src", "settings-tab-health-reminder.js"),
      "utf8"
    );
    for (const p of presets.listPresets()) {
      assert.match(tabSrc, new RegExp(`id:\\s*"${p.id}"`), `tab missing template id "${p.id}"`);
    }
  });
});
