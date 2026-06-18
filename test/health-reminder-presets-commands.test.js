"use strict";

// V2-P3 end-to-end: addFromTemplate / exportReminders / importReminders commands
// must pass the settings controller's commit-key gate and persist. Driven through
// the real controller so a missing updateRegistry entry would surface here
// (the BUG-001 class of failure).

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createSettingsController } = require("../src/settings-controller");

const tempDirs = [];
function makeTempPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-hr-p3-"));
  tempDirs.push(dir);
  return path.join(dir, "clawd-prefs.json");
}
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe("healthReminder preset + import/export commands", () => {
  it("addFromTemplate persists a new reminder from a known template", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    const res = await ctrl.applyCommand("healthReminder.addFromTemplate", { templateId: "water", lang: "zh" });
    assert.equal(res.status, "ok", res.message || "");
    const cfg = ctrl.get("healthReminder");
    assert.equal(cfg.reminders.length, 1);
    assert.equal(cfg.reminders[0].animationKey, "drink");
    assert.ok(cfg.reminders[0].label.length > 0);
  });

  it("addFromTemplate rejects an unknown template id", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    const res = await ctrl.applyCommand("healthReminder.addFromTemplate", { templateId: "nope" });
    assert.equal(res.status, "error");
    assert.equal(ctrl.get("healthReminder").reminders.length, 0);
  });

  it("exportReminders returns a portable envelope without mutating state", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    await ctrl.applyCommand("healthReminder.addFromTemplate", { templateId: "stand", lang: "en" });
    const res = await ctrl.applyCommand("healthReminder.exportReminders", {});
    assert.equal(res.status, "ok", res.message || "");
    assert.ok(res.data && Array.isArray(res.data.reminders));
    assert.equal(res.data.reminders.length, 1);
    assert.equal(res.data.kind, "clawd-health-reminders");
    assert.equal(ctrl.get("healthReminder").reminders.length, 1);
  });

  it("importReminders merge persists incoming reminders", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    await ctrl.applyCommand("healthReminder.addFromTemplate", { templateId: "water", lang: "en" });
    const res = await ctrl.applyCommand("healthReminder.importReminders", {
      mode: "merge",
      data: { reminders: [{ label: "imported", schedule: { type: "interval", intervalMinutes: 50 } }] },
    });
    assert.equal(res.status, "ok", res.message || "");
    assert.equal(res.imported, 1);
    assert.equal(ctrl.get("healthReminder").reminders.length, 2);
  });

  it("importReminders rejects invalid data and leaves state untouched", async () => {
    const ctrl = createSettingsController({ prefsPath: makeTempPath() });
    const res = await ctrl.applyCommand("healthReminder.importReminders", { data: { nope: true } });
    assert.equal(res.status, "error");
    assert.equal(ctrl.get("healthReminder").reminders.length, 0);
  });
});
