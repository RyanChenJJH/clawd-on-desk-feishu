"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { hhMmToParts, hhMmToMinutes } = require("../src/health-reminder/time");

test("hhMmToParts parses valid HH:MM and rejects malformed/out-of-range", () => {
  assert.deepEqual(hhMmToParts("08:30"), [8, 30]);
  assert.deepEqual(hhMmToParts("9:05"), [9, 5]);
  assert.equal(hhMmToParts("25:00"), null);
  assert.equal(hhMmToParts("08:60"), null);
  assert.equal(hhMmToParts("bad"), null);
  assert.equal(hhMmToParts(830), null);
});

test("hhMmToMinutes converts to minutes since midnight", () => {
  assert.equal(hhMmToMinutes("00:00"), 0);
  assert.equal(hhMmToMinutes("08:30"), 510);
  assert.equal(hhMmToMinutes("bad"), null);
});
