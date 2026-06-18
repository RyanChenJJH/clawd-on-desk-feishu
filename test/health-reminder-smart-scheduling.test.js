"use strict";

// V2-P5: smarter scheduling, all OFF by default. Pure logic only here:
//   - onlyWhenActive   : gate fires while the user is away (mouse idle)
//   - adaptiveInterval : stretch the interval after consecutive snoozes
//   - deferPastQuietHours : a fire landing in quiet hours waits for the window end
// (DND is user-controlled and has no knowable end, so deterministic deferral
//  targets the configurable quiet-hours window; see implementation note.)

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { normalizeConfig } = require("../src/health-reminder/reminder-model");
const { shouldFire } = require("../src/health-reminder/gate");
const { adaptiveIntervalMinutes, deferPastQuietHours } = require("../src/health-reminder/scheduler");
const { isWithinQuietHours } = require("../src/health-reminder/quiet-hours");

describe("smart-scheduling config defaults", () => {
  it("all smart flags default to false", () => {
    const c = normalizeConfig({});
    assert.equal(c.onlyWhenActive, false);
    assert.equal(c.adaptiveInterval, false);
    assert.equal(c.deferPastQuietHours, false);
  });
  it("honours explicit true values", () => {
    const c = normalizeConfig({ onlyWhenActive: true, adaptiveInterval: true, deferPastQuietHours: true });
    assert.equal(c.onlyWhenActive, true);
    assert.equal(c.adaptiveInterval, true);
    assert.equal(c.deferPastQuietHours, true);
  });
});

describe("onlyWhenActive gate", () => {
  const now = new Date(2026, 5, 15, 10, 0, 0); // not in any quiet window
  it("suppresses a fire when the user is inactive", () => {
    assert.equal(shouldFire(now, { onlyWhenActive: true, userActive: false }), false);
  });
  it("allows a fire when the user is active", () => {
    assert.equal(shouldFire(now, { onlyWhenActive: true, userActive: true }), true);
  });
  it("has no effect when onlyWhenActive is off (v1 behaviour)", () => {
    assert.equal(shouldFire(now, { onlyWhenActive: false, userActive: false }), true);
  });
});

describe("adaptiveIntervalMinutes", () => {
  it("returns the base unchanged when disabled", () => {
    assert.equal(adaptiveIntervalMinutes(40, 5, { enabled: false }), 40);
  });
  it("returns the base at streak 0", () => {
    assert.equal(adaptiveIntervalMinutes(40, 0, { enabled: true }), 40);
  });
  it("stretches by 1.5x per consecutive snooze", () => {
    assert.equal(adaptiveIntervalMinutes(40, 1, { enabled: true }), 60);
    assert.equal(adaptiveIntervalMinutes(40, 2, { enabled: true }), 80);
  });
  it("caps the stretch factor (default 3x)", () => {
    assert.equal(adaptiveIntervalMinutes(40, 99, { enabled: true }), 120);
  });
});

describe("deferPastQuietHours", () => {
  const quiet = { enabled: true, start: "22:00", end: "08:00" };
  it("leaves the timestamp unchanged when disabled", () => {
    const ts = new Date(2026, 5, 15, 23, 0, 0).getTime();
    assert.equal(deferPastQuietHours(ts, quiet, { enabled: false }), ts);
  });
  it("leaves a timestamp outside quiet hours unchanged", () => {
    const ts = new Date(2026, 5, 15, 10, 0, 0).getTime();
    assert.equal(deferPastQuietHours(ts, quiet, { enabled: true }), ts);
  });
  it("moves a cross-midnight in-window fire to the window end (08:00 next day)", () => {
    const ts = new Date(2026, 5, 15, 23, 0, 0).getTime();
    const out = deferPastQuietHours(ts, quiet, { enabled: true });
    const d = new Date(out);
    assert.equal(d.getHours(), 8);
    assert.equal(d.getMinutes(), 0);
    assert.ok(out > ts);
    assert.equal(isWithinQuietHours(new Date(out), quiet), false);
  });
  it("moves an early-morning in-window fire to the same-day window end", () => {
    const ts = new Date(2026, 5, 15, 2, 0, 0).getTime();
    const out = deferPastQuietHours(ts, quiet, { enabled: true });
    const d = new Date(out);
    assert.equal(d.getHours(), 8);
    assert.equal(d.getDate(), 15);
  });
  it("handles a same-day quiet window", () => {
    const noon = { enabled: true, start: "12:00", end: "14:00" };
    const ts = new Date(2026, 5, 15, 12, 30, 0).getTime();
    const out = deferPastQuietHours(ts, noon, { enabled: true });
    const d = new Date(out);
    assert.equal(d.getHours(), 14);
    assert.equal(d.getDate(), 15);
  });
});
