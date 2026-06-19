"use strict";

// Pure mutation helpers for the `healthReminder` prefs config. Each takes the
// current (normalized) config and returns a new normalized config — no Electron,
// no store, no controller. settings-actions.js wraps these into commandRegistry
// entries that return { status, commit }.

const {
  normalizeConfig,
  normalizeReminder,
  validateReminder,
} = require("./health-reminder/reminder-model");

function readConfig(snapshot) {
  return normalizeConfig(snapshot && snapshot.healthReminder);
}

function addReminder(config, reminderDef) {
  const reminder = normalizeReminder(reminderDef);
  return normalizeConfig({ ...config, reminders: [...config.reminders, reminder] });
}

// Returns { found, config }. patch replaces fields shallowly; a provided
// `schedule` object replaces the whole schedule (the UI always sends a full one).
function updateReminder(config, id, patch) {
  let found = false;
  const reminders = config.reminders.map((reminder) => {
    if (reminder.id !== id) return reminder;
    found = true;
    return normalizeReminder({ ...reminder, ...(patch || {}), id });
  });
  return { found, config: normalizeConfig({ ...config, reminders }) };
}

// Returns { removed, config }.
function removeReminder(config, id) {
  const reminders = config.reminders.filter((reminder) => reminder.id !== id);
  return {
    removed: reminders.length !== config.reminders.length,
    config: normalizeConfig({ ...config, reminders }),
  };
}

// Reorders to match orderedIds; any ids not listed keep their original relative
// order at the end (defensive against a stale UI order).
function reorderReminders(config, orderedIds) {
  const byId = new Map(config.reminders.map((reminder) => [reminder.id, reminder]));
  const out = [];
  for (const id of Array.isArray(orderedIds) ? orderedIds : []) {
    if (byId.has(id)) {
      out.push(byId.get(id));
      byId.delete(id);
    }
  }
  for (const reminder of byId.values()) out.push(reminder);
  return normalizeConfig({ ...config, reminders: out });
}

// Shallow top-level field patch (enabled / respectDnd / quietHours /
// autoCollapseMinutes). normalizeConfig re-validates the result.
function setFields(config, patch) {
  return normalizeConfig({ ...config, ...(patch || {}) });
}

// ── Portable import / export (V2-P3) ──
// A reminder set is purely local, contains no credentials or device info, and
// is safe to share. The envelope mirrors the animation-overrides export shape.
const PORTABLE_KIND = "clawd-health-reminders";
const PORTABLE_VERSION = 1;

// Strip the internal id so an exported set never collides on re-import.
function exportReminders(config) {
  return {
    kind: PORTABLE_KIND,
    version: PORTABLE_VERSION,
    reminders: config.reminders.map((reminder) => ({
      enabled: reminder.enabled,
      label: reminder.label,
      message: reminder.message,
      animationKey: reminder.animationKey,
      schedule: reminder.schedule,
      snoozeMinutes: reminder.snoozeMinutes,
      sound: reminder.sound,
    })),
  };
}

// Merge ("merge", default) appends; "replace" swaps the whole set. Every incoming
// reminder is validated and re-normalized with a FRESH id. Returns
// { ok:true, config, imported } or { ok:false, error } — the whole import is
// rejected (atomically) if the envelope is malformed or any reminder is invalid.
function importReminders(config, payload, options = {}) {
  const mode = options.mode === "replace" ? "replace" : "merge";
  let incoming;
  if (Array.isArray(payload)) {
    incoming = payload;
  } else if (payload && typeof payload === "object" && Array.isArray(payload.reminders)) {
    incoming = payload.reminders;
  } else {
    return { ok: false, error: "import payload must be an array of reminders or an object with a reminders array" };
  }
  if (incoming.length === 0) {
    return { ok: false, error: "import contains no reminders" };
  }
  const normalized = [];
  for (let i = 0; i < incoming.length; i += 1) {
    const def = incoming[i];
    const validation = validateReminder(def);
    if (!validation.ok) {
      return { ok: false, error: `reminder #${i + 1}: ${validation.errors.join("; ")}` };
    }
    normalized.push(normalizeReminder({ ...(def && typeof def === "object" ? def : {}), id: undefined }));
  }
  const base = mode === "replace" ? [] : config.reminders;
  return {
    ok: true,
    imported: normalized.length,
    config: normalizeConfig({ ...config, reminders: [...base, ...normalized] }),
  };
}

module.exports = {
  readConfig,
  addReminder,
  updateReminder,
  removeReminder,
  reorderReminders,
  setFields,
  validateReminder,
  exportReminders,
  importReminders,
  PORTABLE_KIND,
  PORTABLE_VERSION,
};
