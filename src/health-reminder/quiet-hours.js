"use strict";

// Pure logic: decide whether a given moment falls inside a configured quiet-hours
// window. No Electron / Node-host dependencies so it stays unit-testable.

const { hhMmToMinutes } = require("./time");

function isWithinQuietHours(now, quietHours) {
  if (!quietHours || quietHours.enabled !== true) return false;
  const start = hhMmToMinutes(quietHours.start);
  const end = hhMmToMinutes(quietHours.end);
  if (start == null || end == null || start === end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    // Same-day window: inside is [start, end).
    return cur >= start && cur < end;
  }
  // Cross-midnight window (start > end), e.g. 22:00–08:00: inside is
  // [start, 24:00) ∪ [00:00, end).
  return cur >= start || cur < end;
}

module.exports = { isWithinQuietHours };
