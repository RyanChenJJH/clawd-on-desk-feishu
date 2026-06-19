"use strict";

// Unit tests for the health-reminder runtime orchestrator. All Electron / timer
// dependencies are injected as fakes, so this exercises the real scheduling,
// gating, and bubble/body-animation orchestration logic in isolation.

const assert = require("node:assert/strict");
const { describe, it, beforeEach } = require("node:test");

const createHealthReminderRuntime = require("../src/health-reminder-main");
const { normalizeConfig } = require("../src/health-reminder/reminder-model");

function makeFakeTimers() {
  let seq = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    fireAll() { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } },
    lastDelay() { const arr = [...timers.values()]; return arr.length ? arr[arr.length - 1].ms : null; },
    count() { return timers.size; },
  };
}

function makeHarness(overrides = {}) {
  const calls = { shown: [], dismissed: [], body: [] };
  const timers = makeFakeTimers();
  const state = {
    now: overrides.now || 0,
    displayState: overrides.displayState || "idle",
    dnd: overrides.dnd || false,
    config: normalizeConfig(overrides.config || {
      enabled: true,
      reminders: [{
        id: "hr_1", label: "喝水", animationKey: "drink",
        schedule: { type: "interval", intervalMinutes: 45 },
      }],
    }),
  };
  const runtime = createHealthReminderRuntime({
    now: () => state.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    getConfig: () => state.config,
    getDisplayState: () => state.displayState,
    isDnd: () => state.dnd,
    showBubble: (reminder) => calls.shown.push(reminder.id),
    dismissBubble: (id) => calls.dismissed.push(id),
    playBodyAnimation: (reminder) => calls.body.push(reminder.id),
    hasActiveTaskBubble: () => state.task === true,
  });
  return { runtime, timers, calls, state };
}

describe("health reminder runtime: task-priority preemption (v3)", () => {
  it("defers a fired reminder while a task bubble is active, then shows it once the task clears", () => {
    const h = makeHarness();
    h.state.task = true;
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, [], "deferred while a task bubble is showing");
    h.state.task = false;
    h.runtime.onTaskCleared();
    assert.deepEqual(h.calls.shown, ["hr_1"], "shown after the task clears");
  });

  it("immediately removes open health bubbles when a task arrives and restores them after", () => {
    const h = makeHarness();
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, ["hr_1"]);

    h.state.task = true;
    h.runtime.onTaskActive();
    assert.deepEqual(h.calls.dismissed, ["hr_1"], "health bubble exits immediately for the task");
    assert.equal(h.runtime.getStatus().openBubbles, 0);

    h.state.task = false;
    h.runtime.onTaskCleared();
    assert.deepEqual(h.calls.shown, ["hr_1", "hr_1"], "re-shown after the task clears");
    assert.equal(h.runtime.getStatus().openBubbles, 1);
  });

  it("preemption does not acknowledge the reminder or disturb its cadence timer", () => {
    const h = makeHarness();
    h.runtime.start();
    h.timers.fireAll();
    const timersAfterFire = h.timers.count();
    h.state.task = true;
    h.runtime.onTaskActive();
    assert.equal(h.timers.count(), timersAfterFire, "cadence timer untouched (not a confirm/snooze)");
  });
});

describe("health reminder runtime: scheduling", () => {
  it("start() schedules an enabled reminder and shows its bubble on fire", () => {
    const h = makeHarness();
    h.runtime.start();
    assert.equal(h.timers.count(), 1);
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, ["hr_1"]);
  });

  it("start() schedules nothing when the master switch is off", () => {
    const h = makeHarness({ config: { enabled: false, reminders: [{ id: "hr_1", schedule: { type: "interval", intervalMinutes: 5 } }] } });
    h.runtime.start();
    assert.equal(h.timers.count(), 0);
  });

  it("continues the cadence after firing", () => {
    const h = makeHarness();
    h.runtime.start();
    h.timers.fireAll();
    assert.equal(h.timers.count(), 1, "next occurrence rescheduled");
  });
});

describe("health reminder runtime: body animation gating", () => {
  it("plays the body animation when the pet is idle", () => {
    const h = makeHarness({ displayState: "idle" });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.body, ["hr_1"]);
  });

  it("does NOT play the body animation while a task owns the body", () => {
    const h = makeHarness({ displayState: "working" });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, ["hr_1"], "bubble still shows");
    assert.deepEqual(h.calls.body, [], "body animation deferred");
  });

  it("replays the deferred body animation once the body becomes free", () => {
    const h = makeHarness({ displayState: "working" });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.body, []);
    h.runtime.notifyDisplayState("idle");
    assert.deepEqual(h.calls.body, ["hr_1"]);
    // does not replay again on a second idle transition
    h.runtime.notifyDisplayState("working");
    h.runtime.notifyDisplayState("idle");
    assert.deepEqual(h.calls.body, ["hr_1"]);
  });

  it("skips the body animation when reduceMotion is on but still shows the bubble", () => {
    const h = makeHarness({
      config: { enabled: true, reduceMotion: true, reminders: [{ id: "hr_1", animationKey: "drink", schedule: { type: "interval", intervalMinutes: 45 } }] },
    });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, ["hr_1"], "bubble still shows under reduce-motion");
    assert.deepEqual(h.calls.body, [], "body animation suppressed");
  });

  it("skips the body animation entirely for animationKey 'none'", () => {
    const h = makeHarness({
      config: { enabled: true, reminders: [{ id: "hr_1", animationKey: "none", schedule: { type: "interval", intervalMinutes: 45 } }] },
    });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, ["hr_1"]);
    assert.deepEqual(h.calls.body, []);
  });
});

describe("health reminder runtime: quiet/DND gate", () => {
  it("shows no bubble during DND but keeps the cadence", () => {
    const h = makeHarness({ dnd: true });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, []);
    assert.equal(h.timers.count(), 1, "still rescheduled");
  });

  it("shows no bubble during quiet hours", () => {
    const h = makeHarness({
      config: {
        enabled: true,
        quietHours: { enabled: true, start: "00:00", end: "23:59" },
        reminders: [{ id: "hr_1", animationKey: "drink", schedule: { type: "interval", intervalMinutes: 45 } }],
      },
    });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.shown, []);
  });
});

describe("health reminder runtime: confirm / snooze / test / stop", () => {
  it("handleConfirm dismisses the bubble and reschedules", () => {
    const h = makeHarness();
    h.runtime.start();
    h.timers.fireAll();
    h.runtime.handleConfirm("hr_1");
    assert.deepEqual(h.calls.dismissed, ["hr_1"]);
  });

  it("handleSnooze reschedules after snoozeMinutes and dismisses", () => {
    const h = makeHarness({
      config: { enabled: true, reminders: [{ id: "hr_1", animationKey: "drink", snoozeMinutes: 15, schedule: { type: "interval", intervalMinutes: 45 } }] },
    });
    h.runtime.start();
    h.timers.fireAll();
    h.runtime.handleSnooze("hr_1");
    assert.deepEqual(h.calls.dismissed, ["hr_1"]);
    assert.equal(h.timers.lastDelay(), 15 * 60 * 1000);
  });

  it("triggerTest shows the bubble immediately, bypassing DND", () => {
    const h = makeHarness({ dnd: true });
    const res = h.runtime.triggerTest("hr_1");
    assert.equal(res.status, "ok");
    assert.deepEqual(h.calls.shown, ["hr_1"]);
  });

  it("triggerTest errors for an unknown id", () => {
    const h = makeHarness();
    assert.equal(h.runtime.triggerTest("hr_nope").status, "error");
  });

  it("stop() clears all timers", () => {
    const h = makeHarness();
    h.runtime.start();
    h.runtime.stop();
    assert.equal(h.timers.count(), 0);
  });

  it("dismissAllOpen dismisses every open bubble and reschedules them", () => {
    const h = makeHarness({ config: { enabled: true, reminders: [
      { id: "hr_1", animationKey: "none", schedule: { type: "interval", intervalMinutes: 30 } },
      { id: "hr_2", animationKey: "none", schedule: { type: "interval", intervalMinutes: 30 } },
    ] } });
    h.runtime.start();
    h.timers.fireAll(); // both fire -> both bubbles open
    h.runtime.dismissAllOpen();
    assert.deepEqual([...h.calls.dismissed].sort(), ["hr_1", "hr_2"]);
    assert.equal(h.runtime.getStatus().openBubbles, 0);
  });
});
