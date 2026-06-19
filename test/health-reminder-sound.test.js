"use strict";

// V2-P4: a reminder may carry a `sound`. The runtime plays it when (and only
// when) the reminder actually presents — so the quiet/DND gate that suppresses
// the bubble also suppresses the sound. The host's playSound separately honours
// global mute/DND, but the orchestrator must not even attempt a sound on a gated
// fire.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const createHealthReminderRuntime = require("../src/health-reminder-main");
const { normalizeConfig, normalizeReminder } = require("../src/health-reminder/reminder-model");

function makeFakeTimers() {
  let seq = 0;
  const timers = new Map();
  return {
    setTimer: (fn) => { const id = ++seq; timers.set(id, { fn }); return id; },
    clearTimer: (id) => timers.delete(id),
    fireAll() { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } },
  };
}

function makeHarness(overrides = {}) {
  const calls = { shown: [], sound: [] };
  const timers = makeFakeTimers();
  const state = {
    dnd: overrides.dnd || false,
    config: normalizeConfig(overrides.config || {
      enabled: true,
      reminders: [{ id: "hr_1", animationKey: "drink", sound: "complete", schedule: { type: "interval", intervalMinutes: 45 } }],
    }),
  };
  const runtime = createHealthReminderRuntime({
    now: () => 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    getConfig: () => state.config,
    getDisplayState: () => "idle",
    isDnd: () => state.dnd,
    showBubble: (r) => calls.shown.push(r.id),
    playSound: (name) => calls.sound.push(name),
  });
  return { runtime, timers, calls };
}

describe("health reminder runtime: sound", () => {
  it("plays the reminder's sound when it fires", () => {
    const h = makeHarness();
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.sound, ["complete"]);
  });

  it("plays no sound when the reminder has none", () => {
    const h = makeHarness({
      config: { enabled: true, reminders: [{ id: "hr_1", animationKey: "drink", schedule: { type: "interval", intervalMinutes: 45 } }] },
    });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.sound, []);
    assert.deepEqual(h.calls.shown, ["hr_1"], "bubble still shows");
  });

  it("plays no sound when DND suppresses the fire", () => {
    const h = makeHarness({ dnd: true });
    h.runtime.start();
    h.timers.fireAll();
    assert.deepEqual(h.calls.sound, []);
    assert.deepEqual(h.calls.shown, []);
  });

  it("plays the sound on a manual test trigger", () => {
    const h = makeHarness();
    h.runtime.triggerTest("hr_1");
    assert.deepEqual(h.calls.sound, ["complete"]);
  });
});

describe("reminder sound normalization", () => {
  it("keeps a string sound and defaults everything else to null", () => {
    assert.equal(normalizeReminder({ sound: "complete" }).sound, "complete");
    assert.equal(normalizeReminder({ sound: 123 }).sound, null);
    assert.equal(normalizeReminder({}).sound, null);
    assert.equal(normalizeReminder({ sound: null }).sound, null);
  });
});
