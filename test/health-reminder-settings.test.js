"use strict";

// Tests the healthReminder.* settings commands through the public commandRegistry
// interface (snapshot in -> { status, commit } out). Additive file to keep the
// upstream settings-actions.test.js untouched for easier fork merges.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { commandRegistry } = require("../src/settings-actions");
const prefs = require("../src/prefs");

function freshSnapshot() {
  return prefs.getDefaults();
}

// Build a snapshot already containing one reminder, returning { snapshot, id }.
function snapshotWithOneReminder() {
  const res = commandRegistry["healthReminder.addReminder"](
    { reminder: { label: "喝水", schedule: { type: "interval", intervalMinutes: 45 } } },
    { snapshot: freshSnapshot() }
  );
  const snapshot = { ...freshSnapshot(), healthReminder: res.commit.healthReminder };
  return { snapshot, id: res.commit.healthReminder.reminders[0].id };
}

describe("healthReminder.addReminder", () => {
  it("commits a normalized reminder appended to the list", () => {
    const res = commandRegistry["healthReminder.addReminder"](
      { reminder: { label: "喝水", schedule: { type: "interval", intervalMinutes: 45 } } },
      { snapshot: freshSnapshot() }
    );
    assert.equal(res.status, "ok");
    assert.equal(res.commit.healthReminder.reminders.length, 1);
    assert.equal(res.commit.healthReminder.reminders[0].label, "喝水");
    assert.match(res.commit.healthReminder.reminders[0].id, /^hr_/);
  });

  it("rejects an invalid reminder (daily with no times) without committing", () => {
    const res = commandRegistry["healthReminder.addReminder"](
      { reminder: { label: "bad", schedule: { type: "daily", times: [] } } },
      { snapshot: freshSnapshot() }
    );
    assert.equal(res.status, "error");
    assert.equal(res.commit, undefined);
  });
});

describe("healthReminder.updateReminder / removeReminder", () => {
  it("updates an existing reminder by id", () => {
    const { snapshot, id } = snapshotWithOneReminder();
    const res = commandRegistry["healthReminder.updateReminder"](
      { id, patch: { label: "多喝水", message: "再来一杯" } },
      { snapshot }
    );
    assert.equal(res.status, "ok");
    assert.equal(res.commit.healthReminder.reminders[0].label, "多喝水");
    assert.equal(res.commit.healthReminder.reminders[0].message, "再来一杯");
  });

  it("errors on update of an unknown id", () => {
    const { snapshot } = snapshotWithOneReminder();
    const res = commandRegistry["healthReminder.updateReminder"]({ id: "hr_nope", patch: {} }, { snapshot });
    assert.equal(res.status, "error");
  });

  it("removes by id and is a noop for an unknown id", () => {
    const { snapshot, id } = snapshotWithOneReminder();
    const ok = commandRegistry["healthReminder.removeReminder"]({ id }, { snapshot });
    assert.equal(ok.commit.healthReminder.reminders.length, 0);
    const noop = commandRegistry["healthReminder.removeReminder"]({ id: "hr_nope" }, { snapshot });
    assert.equal(noop.noop, true);
    assert.equal(noop.commit, undefined);
  });
});

describe("healthReminder top-level setters", () => {
  it("setEnabled toggles the master switch and rejects non-booleans", () => {
    const ok = commandRegistry["healthReminder.setEnabled"]({ enabled: true }, { snapshot: freshSnapshot() });
    assert.equal(ok.commit.healthReminder.enabled, true);
    const bad = commandRegistry["healthReminder.setEnabled"]({ enabled: "yes" }, { snapshot: freshSnapshot() });
    assert.equal(bad.status, "error");
  });

  it("setQuietHours stores a normalized window", () => {
    const res = commandRegistry["healthReminder.setQuietHours"](
      { quietHours: { enabled: true, start: "22:00", end: "08:00" } },
      { snapshot: freshSnapshot() }
    );
    assert.equal(res.commit.healthReminder.quietHours.enabled, true);
    assert.equal(res.commit.healthReminder.quietHours.start, "22:00");
  });
});

describe("healthReminder.testReminder", () => {
  it("delegates to the injected trigger dep", () => {
    let calledWith = null;
    const res = commandRegistry["healthReminder.testReminder"](
      { id: "hr_1" },
      { snapshot: freshSnapshot(), triggerHealthReminderTest: (id) => { calledWith = id; return { status: "ok" }; } }
    );
    assert.equal(res.status, "ok");
    assert.equal(calledWith, "hr_1");
  });

  it("errors when the trigger dep is missing", () => {
    const res = commandRegistry["healthReminder.testReminder"]({ id: "hr_1" }, { snapshot: freshSnapshot() });
    assert.equal(res.status, "error");
  });
});
