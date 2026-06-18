"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { isWithinQuietHours } = require("../src/health-reminder/quiet-hours");

// Construct a local-time Date (month is 0-indexed). Using local time keeps the
// time-of-day comparison deterministic regardless of the machine's timezone.
function at(hour, minute = 0) {
  return new Date(2026, 5, 15, hour, minute, 0, 0);
}

test("isWithinQuietHours: a disabled window is never active", () => {
  assert.equal(
    isWithinQuietHours(at(23, 0), { enabled: false, start: "22:00", end: "08:00" }),
    false
  );
});

test("isWithinQuietHours: same-day window matches times inside it", () => {
  const window = { enabled: true, start: "09:00", end: "17:00" };
  assert.equal(isWithinQuietHours(at(12, 0), window), true);
  assert.equal(isWithinQuietHours(at(8, 59), window), false);
  assert.equal(isWithinQuietHours(at(20, 0), window), false);
});

test("isWithinQuietHours: cross-midnight window wraps past midnight", () => {
  const window = { enabled: true, start: "22:00", end: "08:00" };
  assert.equal(isWithinQuietHours(at(23, 0), window), true); // late night
  assert.equal(isWithinQuietHours(at(2, 0), window), true); // early morning
  assert.equal(isWithinQuietHours(at(12, 0), window), false); // midday
});

test("isWithinQuietHours: boundaries are start-inclusive, end-exclusive", () => {
  const window = { enabled: true, start: "22:00", end: "08:00" };
  assert.equal(isWithinQuietHours(at(22, 0), window), true); // exactly start
  assert.equal(isWithinQuietHours(at(8, 0), window), false); // exactly end
});

test("isWithinQuietHours: malformed or equal start/end is never active", () => {
  assert.equal(isWithinQuietHours(at(23, 0), { enabled: true, start: "9", end: "17:00" }), false);
  assert.equal(isWithinQuietHours(at(23, 0), { enabled: true, start: "08:00", end: "08:00" }), false);
});
