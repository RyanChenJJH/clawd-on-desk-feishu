"use strict";

// End-to-end regression: healthReminder.* command commits must pass the settings
// controller's commit-key registry validation. The command unit tests call the
// command function directly and inspect { commit }, so they did NOT catch that
// the controller rejects any committed key lacking an updateRegistry entry with
// "unknown settings key healthReminder". This drives the controller path.

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createSettingsController } = require("../src/settings-controller");

const tempDirs = [];
function makeTempPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-hr-ctrl-"));
  tempDirs.push(dir);
  return path.join(dir, "clawd-prefs.json");
}
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe("healthReminder commands through the settings controller", () => {
  it("addReminder commit passes registry validation and persists", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    const res = await ctrl.applyCommand("healthReminder.addReminder", {
      reminder: { label: "喝水", schedule: { type: "interval", intervalMinutes: 45 } },
    });
    assert.equal(res.status, "ok", res.message || "");
    const cfg = ctrl.get("healthReminder");
    assert.equal(cfg.reminders.length, 1);
    assert.equal(cfg.reminders[0].label, "喝水");
  });

  it("setEnabled / setQuietHours commits persist", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    const enabled = await ctrl.applyCommand("healthReminder.setEnabled", { enabled: true });
    assert.equal(enabled.status, "ok", enabled.message || "");
    assert.equal(ctrl.get("healthReminder").enabled, true);

    const quiet = await ctrl.applyCommand("healthReminder.setQuietHours", {
      quietHours: { enabled: true, start: "22:00", end: "08:00" },
    });
    assert.equal(quiet.status, "ok", quiet.message || "");
    assert.equal(ctrl.get("healthReminder").quietHours.enabled, true);
  });

  it("setSmartOptions persists opt-in flags (default off)", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    assert.equal(ctrl.get("healthReminder").onlyWhenActive, false);
    const res = await ctrl.applyCommand("healthReminder.setSmartOptions", {
      onlyWhenActive: true,
      adaptiveInterval: true,
    });
    assert.equal(res.status, "ok", res.message || "");
    assert.equal(ctrl.get("healthReminder").onlyWhenActive, true);
    assert.equal(ctrl.get("healthReminder").adaptiveInterval, true);
    assert.equal(ctrl.get("healthReminder").deferPastQuietHours, false);
  });

  it("setMaxVisibleBubbles persists and clamps to [1,5]", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    assert.equal(ctrl.get("healthReminder").maxVisibleBubbles, 3);
    const ok = await ctrl.applyCommand("healthReminder.setMaxVisibleBubbles", { value: 5 });
    assert.equal(ok.status, "ok", ok.message || "");
    assert.equal(ctrl.get("healthReminder").maxVisibleBubbles, 5);
    await ctrl.applyCommand("healthReminder.setMaxVisibleBubbles", { value: 99 });
    assert.equal(ctrl.get("healthReminder").maxVisibleBubbles, 5, "clamped");
  });

  it("setDisplayMode persists corner (default followPet)", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    assert.equal(ctrl.get("healthReminder").displayMode, "followPet");
    const ok = await ctrl.applyCommand("healthReminder.setDisplayMode", { mode: "corner" });
    assert.equal(ok.status, "ok", ok.message || "");
    assert.equal(ctrl.get("healthReminder").displayMode, "corner");
  });

  it("stats: recordStat is a no-op until enabled, then counts, then clears", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    await ctrl.applyCommand("healthReminder.recordStat", { type: "fired", id: "hr_1" });
    assert.equal(ctrl.get("healthReminder").stats.fired, 0, "no recording while off");

    await ctrl.applyCommand("healthReminder.setStatsEnabled", { enabled: true });
    await ctrl.applyCommand("healthReminder.recordStat", { type: "fired", id: "hr_1" });
    await ctrl.applyCommand("healthReminder.recordStat", { type: "confirmed", id: "hr_1" });
    assert.equal(ctrl.get("healthReminder").stats.fired, 1);
    assert.equal(ctrl.get("healthReminder").stats.confirmed, 1);

    await ctrl.applyCommand("healthReminder.clearStats");
    assert.equal(ctrl.get("healthReminder").stats.fired, 0);
    assert.equal(ctrl.get("healthReminder").stats.confirmed, 0);
  });
});
