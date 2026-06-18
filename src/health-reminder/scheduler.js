"use strict";

// Pure logic: compute the next absolute fire timestamp for a normalized health
// reminder. No Electron / Node-host dependencies.
//
// computeNextFire(reminder, fromTs, { lastFiredTs }) -> ms epoch, strictly after
// fromTs, or null when the reminder cannot fire (disabled / empty schedule).

const { hhMmToParts, hhMmToMinutes } = require("./time");
const { isWithinQuietHours } = require("./quiet-hours");

const MS_PER_MINUTE = 60 * 1000;

// V2-P5 (opt-in). Stretch a reminder's interval after consecutive snoozes:
// each snooze adds 0.5x, capped (default 3x); a confirm resets the streak to 0.
// Disabled -> returns the base unchanged (v1 behaviour).
function adaptiveIntervalMinutes(baseMinutes, snoozeStreak, options = {}) {
  if (!options.enabled) return baseMinutes;
  const streak = Number.isFinite(snoozeStreak) && snoozeStreak > 0 ? Math.floor(snoozeStreak) : 0;
  const maxFactor = Number.isFinite(options.maxFactor) && options.maxFactor >= 1 ? options.maxFactor : 3;
  const factor = Math.min(1 + 0.5 * streak, maxFactor);
  return Math.max(1, Math.round(baseMinutes * factor));
}

// V2-P5 (opt-in). If a computed fire time lands inside the quiet-hours window,
// push it to the moment that window ends (the next wall-clock `end` after the
// fire), so a missed nudge surfaces once right after quiet hours rather than
// being silently skipped. Disabled / outside the window -> unchanged.
// DND has no knowable end, so only the configurable quiet window is deferred.
function nextWallClockAfter(tsMs, minutesOfDay) {
  const base = new Date(tsMs);
  const h = Math.floor(minutesOfDay / 60);
  const m = minutesOfDay % 60;
  let cand = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0).getTime();
  if (cand <= tsMs) {
    cand = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, h, m, 0, 0).getTime();
  }
  return cand;
}

function deferPastQuietHours(nextTs, quietHours, options = {}) {
  if (!options.enabled) return nextTs;
  if (!isWithinQuietHours(new Date(nextTs), quietHours)) return nextTs;
  const end = hhMmToMinutes(quietHours.end);
  if (end == null) return nextTs;
  return nextWallClockAfter(nextTs, end);
}

// Roll a timestamp forward whole days (preserving local wall-clock time) until
// it lands on an allowed weekday. Empty/absent allowedDays means "every day".
function deferToAllowedWeekday(tsMs, allowedDays) {
  if (!Array.isArray(allowedDays) || allowedDays.length === 0) return tsMs;
  let d = new Date(tsMs);
  for (let i = 0; i < 7; i += 1) {
    if (allowedDays.includes(d.getDay())) return d.getTime();
    d = new Date(
      d.getFullYear(), d.getMonth(), d.getDate() + 1,
      d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()
    );
  }
  return d.getTime();
}

function computeDailyNextFire(schedule, fromTs) {
  const parsedTimes = (schedule.times || [])
    .map(hhMmToParts)
    .filter((t) => t != null)
    .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  if (parsedTimes.length === 0) return null;
  const allowedDays = Array.isArray(schedule.days) ? schedule.days : [];
  const base = new Date(fromTs);
  // Scan today plus the next 7 days to find the next allowed weekday + time.
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const probe = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset);
    if (allowedDays.length > 0 && !allowedDays.includes(probe.getDay())) continue;
    for (const [hours, minutes] of parsedTimes) {
      const candidate = new Date(
        probe.getFullYear(), probe.getMonth(), probe.getDate(), hours, minutes, 0, 0
      ).getTime();
      if (candidate > fromTs) return candidate;
    }
  }
  return null;
}

function computeNextFire(reminder, fromTs, options = {}) {
  if (!reminder || reminder.enabled === false) return null;
  const schedule = reminder.schedule || {};
  if (schedule.type === "interval") {
    const interval = schedule.intervalMinutes * MS_PER_MINUTE;
    const lastFiredTs = options.lastFiredTs;
    let next;
    if (lastFiredTs == null || !Number.isFinite(lastFiredTs)) {
      next = fromTs + interval;
    } else {
      next = lastFiredTs + interval;
      if (next <= fromTs) {
        // Rolled past while the app slept: jump to the first slot after fromTs
        // instead of replaying every missed interval.
        const missed = Math.ceil((fromTs - lastFiredTs) / interval);
        next = lastFiredTs + missed * interval;
        if (next <= fromTs) next += interval;
      }
    }
    return deferToAllowedWeekday(next, schedule.days);
  }
  if (schedule.type === "daily") {
    return computeDailyNextFire(schedule, fromTs);
  }
  return null;
}

module.exports = { computeNextFire, adaptiveIntervalMinutes, deferPastQuietHours };
