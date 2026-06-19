"use strict";

// Integration assertions for the healthReminder prefs schema + healthReminders
// theme-override slot. Kept in a separate file (rather than editing the upstream
// prefs.test.js) to minimize fork merge churn; still exercises the public
// prefs.validate / prefs.getDefaults API.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const prefs = require("../src/prefs");

describe("prefs healthReminder schema", () => {
  it("defaults the master switch off with no reminders", () => {
    const d = prefs.getDefaults();
    assert.equal(d.healthReminder.enabled, false);
    assert.equal(d.healthReminder.respectDnd, true);
    assert.equal(d.healthReminder.quietHours.enabled, false);
    assert.deepEqual(d.healthReminder.reminders, []);
  });

  it("normalizes reminders and drops non-object entries", () => {
    const v = prefs.validate({
      healthReminder: {
        enabled: true,
        reminders: [
          { label: "喝水", schedule: { type: "interval", intervalMinutes: 45 } },
          "junk",
        ],
      },
    });
    assert.equal(v.healthReminder.enabled, true);
    assert.equal(v.healthReminder.reminders.length, 1);
    assert.match(v.healthReminder.reminders[0].id, /^hr_/);
  });
});

describe("prefs healthReminders theme overrides", () => {
  it("keeps a healthReminders override slot (file + durationMs) like reactions", () => {
    const v = prefs.validate({
      themeOverrides: {
        clawd: { healthReminders: { drink: { file: "custom-drink.svg", durationMs: 5000 } } },
      },
    });
    assert.deepEqual(v.themeOverrides.clawd.healthReminders, {
      drink: { file: "custom-drink.svg", durationMs: 5000 },
    });
  });
});
