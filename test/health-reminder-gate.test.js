"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { shouldFire, canPlayBodyAnimation } = require("../src/health-reminder/gate");

function at(hour, minute = 0) {
  return new Date(2026, 5, 15, hour, minute, 0, 0);
}

test("shouldFire is blocked when DND is on and respectDnd is true", () => {
  assert.equal(
    shouldFire(at(10, 0), { dnd: true, respectDnd: true, quietHours: { enabled: false } }),
    false
  );
});

test("shouldFire is blocked during quiet hours", () => {
  assert.equal(
    shouldFire(at(23, 0), {
      dnd: false,
      respectDnd: true,
      quietHours: { enabled: true, start: "22:00", end: "08:00" },
    }),
    false
  );
});

test("shouldFire allows a normal, non-quiet, non-DND moment", () => {
  assert.equal(
    shouldFire(at(10, 0), { dnd: false, respectDnd: true, quietHours: { enabled: false } }),
    true
  );
});

test("shouldFire ignores DND when respectDnd is false", () => {
  assert.equal(
    shouldFire(at(10, 0), { dnd: true, respectDnd: false, quietHours: { enabled: false } }),
    true
  );
});

test("canPlayBodyAnimation is true only for resting states", () => {
  assert.equal(canPlayBodyAnimation("idle"), true);
  assert.equal(canPlayBodyAnimation("sleeping"), true);
  assert.equal(canPlayBodyAnimation("working"), false);
  assert.equal(canPlayBodyAnimation("thinking"), false);
  assert.equal(canPlayBodyAnimation("notification"), false);
  assert.equal(canPlayBodyAnimation("yawning"), false); // mid sleep-transition
  assert.equal(canPlayBodyAnimation("some-future-state"), false); // conservative default
});
