"use strict";

// V2-P7: opt-in, strictly-local health-reminder stats. Pure counting only — no
// I/O, no network, no Electron. The runtime increments these via an injected
// recordStat dep ONLY when statsEnabled is on; they are persisted in the
// healthReminder prefs and deliberately excluded from the portable export, so
// stats never leave the device through any channel.

const EVENT_TYPES = ["fired", "confirmed", "snoozed"];

function clampCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function emptyStats() {
  return { fired: 0, confirmed: 0, snoozed: 0, byReminder: {} };
}

function normalizeStats(stats) {
  const src = stats && typeof stats === "object" ? stats : {};
  const srcBy = src.byReminder && typeof src.byReminder === "object" ? src.byReminder : {};
  const byReminder = {};
  for (const id of Object.keys(srcBy)) {
    const entry = srcBy[id] && typeof srcBy[id] === "object" ? srcBy[id] : {};
    byReminder[id] = {
      fired: clampCount(entry.fired),
      confirmed: clampCount(entry.confirmed),
      snoozed: clampCount(entry.snoozed),
    };
  }
  return {
    fired: clampCount(src.fired),
    confirmed: clampCount(src.confirmed),
    snoozed: clampCount(src.snoozed),
    byReminder,
  };
}

// Pure: returns a new stats object with `type` incremented (total + per-reminder).
// Unknown event types are ignored; a missing reminderId records the total only.
function recordEvent(stats, type, reminderId) {
  const base = normalizeStats(stats);
  if (!EVENT_TYPES.includes(type)) return base;
  const next = { ...base, byReminder: { ...base.byReminder } };
  next[type] = base[type] + 1;
  if (reminderId) {
    const per = base.byReminder[reminderId] || { fired: 0, confirmed: 0, snoozed: 0 };
    next.byReminder[reminderId] = { ...per, [type]: per[type] + 1 };
  }
  return next;
}

module.exports = { EVENT_TYPES, emptyStats, normalizeStats, recordEvent };
