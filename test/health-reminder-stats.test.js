"use strict";

// V2-P7: opt-in, strictly-local stats. Pure counting logic — fired/confirmed/
// snoozed totals plus per-reminder breakdown. No I/O, no network.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { emptyStats, recordEvent, normalizeStats } = require("../src/health-reminder/stats");
const { normalizeConfig } = require("../src/health-reminder/reminder-model");
const hrSettings = require("../src/health-reminder-settings");
const createHealthReminderRuntime = require("../src/health-reminder-main");

function makeStatsRuntime(statsEnabled) {
  const calls = [];
  const timers = new Map();
  let seq = 0;
  const state = {
    config: normalizeConfig({
      enabled: true,
      statsEnabled,
      reminders: [{ id: "hr_1", animationKey: "none", snoozeMinutes: 10, schedule: { type: "interval", intervalMinutes: 30 } }],
    }),
  };
  const runtime = createHealthReminderRuntime({
    now: () => 0,
    setTimer: (fn) => { const id = ++seq; timers.set(id, fn); return id; },
    clearTimer: (id) => timers.delete(id),
    getConfig: () => state.config,
    getDisplayState: () => "idle",
    isDnd: () => false,
    recordStat: (type, id) => calls.push([type, id]),
  });
  const fireAll = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return { runtime, fireAll, calls };
}

describe("health-reminder stats", () => {
  it("emptyStats starts at zero", () => {
    const s = emptyStats();
    assert.deepEqual(s, { fired: 0, confirmed: 0, snoozed: 0, byReminder: {} });
  });

  it("recordEvent increments the total and the per-reminder breakdown", () => {
    let s = emptyStats();
    s = recordEvent(s, "fired", "hr_1");
    s = recordEvent(s, "fired", "hr_1");
    s = recordEvent(s, "confirmed", "hr_1");
    s = recordEvent(s, "snoozed", "hr_2");
    assert.equal(s.fired, 2);
    assert.equal(s.confirmed, 1);
    assert.equal(s.snoozed, 1);
    assert.deepEqual(s.byReminder.hr_1, { fired: 2, confirmed: 1, snoozed: 0 });
    assert.deepEqual(s.byReminder.hr_2, { fired: 0, confirmed: 0, snoozed: 1 });
  });

  it("recordEvent is immutable (does not mutate the input)", () => {
    const s0 = emptyStats();
    const s1 = recordEvent(s0, "fired", "hr_1");
    assert.equal(s0.fired, 0);
    assert.notEqual(s0, s1);
  });

  it("recordEvent ignores an unknown event type", () => {
    const s = recordEvent(emptyStats(), "bogus", "hr_1");
    assert.deepEqual(s, emptyStats());
  });

  it("recordEvent tolerates a missing reminder id (totals only)", () => {
    const s = recordEvent(emptyStats(), "fired");
    assert.equal(s.fired, 1);
    assert.deepEqual(s.byReminder, {});
  });

  it("normalizeStats coerces garbage into the canonical shape", () => {
    assert.deepEqual(normalizeStats(null), emptyStats());
    assert.deepEqual(normalizeStats({ fired: "x", confirmed: 3.7, snoozed: -2 }), {
      fired: 0, confirmed: 3, snoozed: 0, byReminder: {},
    });
    const n = normalizeStats({ byReminder: { hr_1: { fired: 5, confirmed: "no", snoozed: 1 } } });
    assert.deepEqual(n.byReminder.hr_1, { fired: 5, confirmed: 0, snoozed: 1 });
  });
});

describe("stats config + privacy", () => {
  it("statsEnabled defaults off and stats default empty", () => {
    const c = normalizeConfig({});
    assert.equal(c.statsEnabled, false);
    assert.deepEqual(c.stats, emptyStats());
  });

  it("never leaks stats into the portable export", () => {
    const cfg = normalizeConfig({
      enabled: true,
      statsEnabled: true,
      stats: { fired: 9, confirmed: 4, snoozed: 2, byReminder: { hr_1: { fired: 9, confirmed: 4, snoozed: 2 } } },
      reminders: [{ label: "x", schedule: { type: "interval", intervalMinutes: 30 } }],
    });
    const out = hrSettings.exportReminders(cfg);
    assert.ok(!("stats" in out), "export envelope must not contain stats");
    assert.ok(!("statsEnabled" in out));
    const serialized = JSON.stringify(out);
    assert.ok(!serialized.includes("\"fired\""), "no stats counters anywhere in the export");
  });
});

describe("stats runtime recording", () => {
  it("records fired/snoozed/confirmed when statsEnabled is on", () => {
    const h = makeStatsRuntime(true);
    h.runtime.start();
    h.fireAll(); // fired
    h.runtime.handleSnooze("hr_1"); // snoozed
    h.runtime.handleConfirm("hr_1"); // confirmed
    assert.deepEqual(h.calls, [["fired", "hr_1"], ["snoozed", "hr_1"], ["confirmed", "hr_1"]]);
  });

  it("records nothing when statsEnabled is off", () => {
    const h = makeStatsRuntime(false);
    h.runtime.start();
    h.fireAll();
    h.runtime.handleSnooze("hr_1");
    h.runtime.handleConfirm("hr_1");
    assert.deepEqual(h.calls, []);
  });
});
