"use strict";

// V2-P5 runtime wiring: the orchestrator consults onlyWhenActive (via isUserActive),
// stretches the cadence after snoozes when adaptiveInterval is on (reset on confirm),
// and defers a quiet-hours fire to the window end when deferPastQuietHours is on.
// With every flag off the scheduling must match v1 exactly.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const createHealthReminderRuntime = require("../src/health-reminder-main");
const { normalizeConfig } = require("../src/health-reminder/reminder-model");

const MIN = 60 * 1000;

function makeFakeTimers() {
  let seq = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    fireAll() { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } },
    lastDelay() { const a = [...timers.values()]; return a.length ? a[a.length - 1].ms : null; },
  };
}

function makeHarness(overrides = {}) {
  const calls = { shown: [] };
  const timers = makeFakeTimers();
  const state = {
    now: overrides.now || 0,
    userActive: overrides.userActive !== false,
    config: normalizeConfig(overrides.config || {
      enabled: true,
      reminders: [{ id: "hr_1", animationKey: "none", snoozeMinutes: 10, schedule: { type: "interval", intervalMinutes: 40 } }],
    }),
  };
  const runtime = createHealthReminderRuntime({
    now: () => state.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    getConfig: () => state.config,
    getDisplayState: () => "idle",
    isDnd: () => false,
    isUserActive: () => state.userActive,
    showBubble: (r) => calls.shown.push(r.id),
  });
  return { runtime, timers, calls, state };
}

describe("onlyWhenActive runtime wiring", () => {
  it("suppresses the bubble when onlyWhenActive is on and the user is away", () => {
    const h = makeHarness({
      userActive: false,
      config: { enabled: true, onlyWhenActive: true, reminders: [{ id: "hr_1", animationKey: "none", schedule: { type: "interval", intervalMinutes: 40 } }] },
    });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, []);
  });
  it("shows the bubble when the user is active", () => {
    const h = makeHarness({
      userActive: true,
      config: { enabled: true, onlyWhenActive: true, reminders: [{ id: "hr_1", animationKey: "none", schedule: { type: "interval", intervalMinutes: 40 } }] },
    });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, ["hr_1"]);
  });
});

describe("adaptiveInterval runtime wiring", () => {
  function adaptiveHarness() {
    return makeHarness({
      config: { enabled: true, adaptiveInterval: true, reminders: [{ id: "hr_1", animationKey: "none", snoozeMinutes: 10, schedule: { type: "interval", intervalMinutes: 40 } }] },
    });
  }

  it("stretches the next interval after a snooze and restores it on confirm", () => {
    const h = adaptiveHarness();
    h.runtime.start();
    assert.equal(h.timers.lastDelay(), 40 * MIN, "base interval at streak 0");
    h.timers.fireAll(); // regular fire -> reschedule (streak still 0)
    assert.equal(h.timers.lastDelay(), 40 * MIN);
    h.runtime.handleSnooze("hr_1"); // streak -> 1, snooze timer
    assert.equal(h.timers.lastDelay(), 10 * MIN, "snooze uses snoozeMinutes");
    h.timers.fireAll(); // snooze fires -> reschedule with streak 1 -> 1.5x
    assert.equal(h.timers.lastDelay(), 60 * MIN, "interval stretched after snooze");
    h.runtime.handleConfirm("hr_1"); // streak reset -> base
    assert.equal(h.timers.lastDelay(), 40 * MIN, "interval restored after confirm");
  });

  it("does NOT stretch when adaptiveInterval is off (v1 behaviour)", () => {
    const h = makeHarness(); // flags off
    h.runtime.start();
    h.runtime.handleSnooze("hr_1");
    h.timers.fireAll();
    assert.equal(h.timers.lastDelay(), 40 * MIN);
  });
});

describe("deferPastQuietHours runtime wiring", () => {
  it("pushes a quiet-hours fire to the window end when enabled", () => {
    const h = makeHarness({
      now: 0, // local 00:00, inside an all-day quiet window
      config: {
        enabled: true,
        deferPastQuietHours: true,
        quietHours: { enabled: true, start: "00:00", end: "23:59" },
        reminders: [{ id: "hr_1", animationKey: "none", schedule: { type: "interval", intervalMinutes: 45 } }],
      },
    });
    h.runtime.start();
    assert.ok(h.timers.lastDelay() > 60 * MIN, "deferred to quiet-hours end, not +45min");
  });
});
