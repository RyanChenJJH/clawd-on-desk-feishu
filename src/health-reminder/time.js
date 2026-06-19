"use strict";

// Shared HH:MM parsing for the health-reminder pure-logic modules. Keeping one
// copy avoids drift between quiet-hours, reminder-model and scheduler.

function hhMmToParts(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return [hours, minutes];
}

function hhMmToMinutes(value) {
  const parts = hhMmToParts(value);
  return parts ? parts[0] * 60 + parts[1] : null;
}

module.exports = { hhMmToParts, hhMmToMinutes };
