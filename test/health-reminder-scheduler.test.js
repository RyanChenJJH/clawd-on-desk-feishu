"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { computeNextFire } = require("../src/health-reminder/scheduler");
const { normalizeReminder } = require("../src/health-reminder/reminder-model");

// Local-time epoch ms (month 0-indexed). 2026-06-15 is a Monday.
function ts(year, monthIndex, day, hour, minute = 0) {
  return new Date(year, monthIndex, day, hour, minute, 0, 0).getTime();
}
const MIN = 60 * 1000;

test("interval without lastFired fires intervalMinutes after now", () => {
  const r = normalizeReminder({ schedule: { type: "interval", intervalMinutes: 45 } });
  const now = ts(2026, 5, 15, 10, 0); // Mon 10:00
  assert.equal(computeNextFire(r, now, {}), now + 45 * MIN);
});

test("interval with lastFired fires one interval after lastFired", () => {
  const r = normalizeReminder({ schedule: { type: "interval", intervalMinutes: 60 } });
  const lastFiredTs = ts(2026, 5, 15, 9, 0);
  const now = ts(2026, 5, 15, 9, 30);
  assert.equal(computeNextFire(r, now, { lastFiredTs }), ts(2026, 5, 15, 10, 0));
});

test("interval rolls forward past missed slots after a long gap", () => {
  const r = normalizeReminder({ schedule: { type: "interval", intervalMinutes: 60 } });
  const lastFiredTs = ts(2026, 5, 15, 9, 0);
  const now = ts(2026, 5, 15, 14, 15); // missed 10:00..14:00 while asleep
  assert.equal(computeNextFire(r, now, { lastFiredTs }), ts(2026, 5, 15, 15, 0));
});

test("disabled reminder never fires", () => {
  const r = normalizeReminder({ enabled: false, schedule: { type: "interval", intervalMinutes: 45 } });
  assert.equal(computeNextFire(r, ts(2026, 5, 15, 10, 0), {}), null);
});

test("daily fires at the next upcoming time today", () => {
  const r = normalizeReminder({ schedule: { type: "daily", times: ["12:00"] } });
  assert.equal(computeNextFire(r, ts(2026, 5, 15, 9, 0), {}), ts(2026, 5, 15, 12, 0));
});

test("daily rolls to tomorrow when today's times have passed", () => {
  const r = normalizeReminder({ schedule: { type: "daily", times: ["12:00"] } });
  assert.equal(computeNextFire(r, ts(2026, 5, 15, 13, 0), {}), ts(2026, 5, 16, 12, 0));
});

test("daily picks the earliest upcoming among multiple times", () => {
  const r = normalizeReminder({ schedule: { type: "daily", times: ["09:00", "12:00", "18:30"] } });
  assert.equal(computeNextFire(r, ts(2026, 5, 15, 10, 0), {}), ts(2026, 5, 15, 12, 0));
});

test("daily weekday filter skips the weekend to the next allowed day", () => {
  // Off-work 18:30, Mon–Fri only.
  const r = normalizeReminder({ schedule: { type: "daily", times: ["18:30"], days: [1, 2, 3, 4, 5] } });
  const friEvening = ts(2026, 5, 19, 19, 0); // Fri past 18:30 -> next is Mon
  assert.equal(computeNextFire(r, friEvening, {}), ts(2026, 5, 22, 18, 30));
});

test("interval weekday filter defers a weekend slot to the next allowed day", () => {
  const r = normalizeReminder({ schedule: { type: "interval", intervalMinutes: 60, days: [1, 2, 3, 4, 5] } });
  const satMorning = ts(2026, 5, 20, 10, 0); // Sat; raw next 11:00 Sat is disallowed
  assert.equal(computeNextFire(r, satMorning, {}), ts(2026, 5, 22, 11, 0)); // Mon 11:00
});
