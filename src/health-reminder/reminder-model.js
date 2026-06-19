"use strict";

// Pure logic: normalize and validate health-reminder definitions and the
// top-level config. No Electron / Node-host dependencies.

const { randomUUID } = require("node:crypto");
const { hhMmToMinutes } = require("./time");
const { normalizeStats } = require("./stats");

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function clampInt(value, min, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.round(value);
  return n < min ? min : n;
}

function generateReminderId() {
  return "hr_" + randomUUID().replace(/-/g, "").slice(0, 12);
}

function normalizeTimes(times) {
  if (!Array.isArray(times)) return [];
  const seen = new Set();
  const valid = [];
  for (const entry of times) {
    const minutes = hhMmToMinutes(entry);
    if (minutes == null) continue;
    const canonical = entry.trim();
    if (seen.has(minutes)) continue;
    seen.add(minutes);
    valid.push({ canonical, minutes });
  }
  valid.sort((a, b) => a.minutes - b.minutes);
  return valid.map((item) => item.canonical);
}

function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  const set = new Set();
  for (const day of days) {
    if (Number.isInteger(day) && day >= 0 && day <= 6) set.add(day);
  }
  return [...set].sort((a, b) => a - b);
}

function normalizeSchedule(schedule) {
  const src = schedule && typeof schedule === "object" ? schedule : {};
  const type = src.type === "daily" ? "daily" : "interval";
  return {
    type,
    intervalMinutes: clampInt(src.intervalMinutes, 1, 45),
    times: normalizeTimes(src.times),
    days: normalizeDays(src.days),
  };
}

function normalizeReminder(def) {
  const src = def && typeof def === "object" ? def : {};
  const id = asString(src.id) ? src.id : generateReminderId();
  return {
    id,
    enabled: src.enabled !== false,
    label: asString(src.label),
    message: asString(src.message),
    animationKey: asString(src.animationKey, "none") || "none",
    schedule: normalizeSchedule(src.schedule),
    snoozeMinutes: clampInt(src.snoozeMinutes, 1, 10),
    sound: src.sound == null ? null : asString(src.sound, null),
  };
}

function validateReminder(def) {
  const errors = [];
  const src = def && typeof def === "object" ? def : {};
  const schedule = src.schedule && typeof src.schedule === "object" ? src.schedule : {};
  const type = schedule.type === "daily" ? "daily" : "interval";

  if (type === "interval") {
    const minutes = schedule.intervalMinutes;
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 1) {
      errors.push("intervalMinutes must be a number >= 1");
    }
  } else {
    if (normalizeTimes(schedule.times).length === 0) {
      errors.push("daily schedule needs at least one valid HH:MM time");
    }
  }

  return { ok: errors.length === 0, errors };
}

function normalizeQuietHours(quietHours) {
  const src = quietHours && typeof quietHours === "object" ? quietHours : {};
  return {
    enabled: src.enabled === true,
    start: hhMmToMinutes(src.start) != null ? src.start.trim() : "22:00",
    end: hhMmToMinutes(src.end) != null ? src.end.trim() : "08:00",
  };
}

function normalizeConfig(config) {
  const src = config && typeof config === "object" ? config : {};
  const reminders = Array.isArray(src.reminders)
    ? src.reminders
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => normalizeReminder(entry))
    : [];
  return {
    enabled: src.enabled === true,
    respectDnd: src.respectDnd !== false,
    quietHours: normalizeQuietHours(src.quietHours),
    autoCollapseMinutes: clampInt(src.autoCollapseMinutes, 0, 0),
    // v3: global bubble display mode. followPet (default) follows the pet and
    // clamps to the screen; corner pins all health cards to the bottom-right.
    displayMode: src.displayMode === "corner" ? "corner" : "followPet",
    // Smart scheduling (V2-P5) — all opt-in, default off so behaviour matches v1.
    onlyWhenActive: src.onlyWhenActive === true,
    adaptiveInterval: src.adaptiveInterval === true,
    deferPastQuietHours: src.deferPastQuietHours === true,
    // Accessibility (V2-P8): suppress the body animation; bubble/text still show.
    reduceMotion: src.reduceMotion === true,
    // Visible health-bubble stack cap (V2-P6); v1 behaviour is 3, clamped [1,5].
    maxVisibleBubbles: Math.min(clampInt(src.maxVisibleBubbles, 1, 3), 5),
    // Opt-in local stats (V2-P7); default off, strictly local, never exported.
    statsEnabled: src.statsEnabled === true,
    stats: normalizeStats(src.stats),
    reminders,
  };
}

module.exports = {
  normalizeReminder,
  validateReminder,
  normalizeConfig,
  generateReminderId,
};
