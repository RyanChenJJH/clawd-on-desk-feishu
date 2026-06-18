"use strict";

// Built-in reminder templates for one-click "add from template". Pure data +
// a builder — no Electron / store. Each template carries a stable id, the
// animation key it pairs with, a default schedule, and bilingual (zh/en)
// label/message so the settings UI can instantiate one in the current language
// without a separate i18n lookup. The UI may still edit the result afterward.

const PRESETS = [
  {
    id: "water",
    animationKey: "drink",
    labelZh: "喝水", labelEn: "Drink water",
    messageZh: "起来喝口水 💧", messageEn: "Time to hydrate 💧",
    schedule: { type: "interval", intervalMinutes: 45 },
    snoozeMinutes: 10,
  },
  {
    id: "stand",
    animationKey: "stretch",
    labelZh: "久坐起身", labelEn: "Stand & stretch",
    messageZh: "坐太久啦，起来动动 🤸", messageEn: "You've been sitting a while — stand up 🤸",
    schedule: { type: "interval", intervalMinutes: 60 },
    snoozeMinutes: 10,
  },
  {
    id: "eyerest",
    animationKey: "eyerest",
    labelZh: "护眼远眺", labelEn: "Eye rest",
    messageZh: "看看 6 米外的地方，放松眼睛 👀", messageEn: "Look ~20 ft away to rest your eyes 👀",
    schedule: { type: "interval", intervalMinutes: 30 },
    snoozeMinutes: 5,
  },
  {
    id: "breathe",
    animationKey: "breathe",
    labelZh: "深呼吸", labelEn: "Deep breathing",
    messageZh: "慢慢吸气，慢慢呼气 🌬️", messageEn: "Slow breath in, slow breath out 🌬️",
    schedule: { type: "interval", intervalMinutes: 90 },
    snoozeMinutes: 15,
  },
  {
    id: "pomodoro",
    animationKey: "stretch",
    labelZh: "番茄钟休息", labelEn: "Pomodoro break",
    messageZh: "一个番茄钟到啦，休息 5 分钟 🍅", messageEn: "Pomodoro done — take a 5 min break 🍅",
    schedule: { type: "interval", intervalMinutes: 25 },
    snoozeMinutes: 5,
  },
  {
    id: "lunch",
    animationKey: "eat",
    labelZh: "午饭时间", labelEn: "Lunch time",
    messageZh: "中午啦，去吃饭 🍱", messageEn: "It's noon — go have lunch 🍱",
    schedule: { type: "daily", times: ["12:00"] },
    snoozeMinutes: 15,
  },
  {
    id: "offwork",
    animationKey: "offwork",
    labelZh: "下班提醒", labelEn: "Off work",
    messageZh: "到点啦，收拾下班 👋", messageEn: "Time to wrap up and head out 👋",
    schedule: { type: "daily", times: ["18:00"], days: [1, 2, 3, 4, 5] },
    snoozeMinutes: 10,
  },
  {
    id: "sleeptime",
    animationKey: "sleeptime",
    labelZh: "该睡觉了", labelEn: "Bedtime",
    messageZh: "夜深了，准备休息吧 🌙", messageEn: "It's late — time to wind down 🌙",
    schedule: { type: "daily", times: ["23:00"] },
    snoozeMinutes: 20,
  },
];

function isZh(lang) {
  return String(lang || "").startsWith("zh");
}

// Lightweight catalog for the UI: id + animation key + bilingual label.
function listPresets() {
  return PRESETS.map((p) => ({
    id: p.id,
    animationKey: p.animationKey,
    labelZh: p.labelZh,
    labelEn: p.labelEn,
  }));
}

// Instantiate a reminder def (pre-normalization) in the given language, or null
// if the id is unknown. The schedule is deep-cloned so callers can mutate freely.
function buildFromPreset(id, lang) {
  const p = PRESETS.find((entry) => entry.id === id);
  if (!p) return null;
  const zh = isZh(lang);
  return {
    enabled: true,
    label: zh ? p.labelZh : p.labelEn,
    message: zh ? p.messageZh : p.messageEn,
    animationKey: p.animationKey,
    schedule: JSON.parse(JSON.stringify(p.schedule)),
    snoozeMinutes: p.snoozeMinutes,
  };
}

module.exports = { PRESETS, listPresets, buildFromPreset };
