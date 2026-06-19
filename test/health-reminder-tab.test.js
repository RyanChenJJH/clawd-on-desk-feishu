"use strict";

// Smoke test: the health-reminder settings tab module loads (IIFE registers on
// globalThis) and init() wires a render function into core.tabs. The full DOM
// render is exercised by the browser-env harness; this guards module wiring
// without a DOM.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

require("../src/settings-tab-health-reminder");

describe("settings-tab-health-reminder module", () => {
  it("registers ClawdSettingsTabHealthReminder with an init()", () => {
    assert.equal(typeof globalThis.ClawdSettingsTabHealthReminder, "object");
    assert.equal(typeof globalThis.ClawdSettingsTabHealthReminder.init, "function");
  });

  it("init() registers a render function for the healthReminder tab", () => {
    const core = { tabs: {} };
    globalThis.ClawdSettingsTabHealthReminder.init(core);
    assert.ok(core.tabs.healthReminder);
    assert.equal(typeof core.tabs.healthReminder.render, "function");
  });
});
