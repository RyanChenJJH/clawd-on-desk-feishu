"use strict";

// Additive tests for the "health reminder animation" override slot: the
// setAnimationOverride command branch and the runtime override application.
// Kept separate from upstream anim-override tests to ease fork merges.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const themeOverrideCommands = require("../src/settings-actions-theme-overrides");
const { applyUserOverridesPatch } = require("../src/theme-variants");

describe("setAnimationOverride healthReminder slot", () => {
  it("writes a healthReminders override entry (file + durationMs)", () => {
    // clawd is NOT the active theme here, so no activateTheme dep is required.
    const snapshot = { theme: "cloudling", themeOverrides: {} };
    const res = themeOverrideCommands.setAnimationOverride(
      { themeId: "clawd", slotType: "healthReminder", healthKey: "drink", file: "custom-drink.svg", durationMs: 6000 },
      { snapshot }
    );
    assert.equal(res.status, "ok");
    assert.deepEqual(res.commit.themeOverrides.clawd.healthReminders.drink, {
      file: "custom-drink.svg",
      durationMs: 6000,
    });
  });

  it("preserves other override slots when editing a health slot", () => {
    const snapshot = {
      theme: "cloudling",
      themeOverrides: { clawd: { reactions: { drag: { file: "d.svg" } } } },
    };
    const res = themeOverrideCommands.setAnimationOverride(
      { themeId: "clawd", slotType: "healthReminder", healthKey: "eat", file: "eat2.svg" },
      { snapshot }
    );
    assert.equal(res.status, "ok");
    assert.deepEqual(res.commit.themeOverrides.clawd.reactions, { drag: { file: "d.svg" } });
    assert.equal(res.commit.themeOverrides.clawd.healthReminders.eat.file, "eat2.svg");
  });
});

describe("applyUserOverridesPatch healthReminders", () => {
  it("replaces a health animation file and duration at load time", () => {
    const raw = { healthReminders: { drink: { file: "clawd-health-drink.svg", duration: 4000 } } };
    const patched = applyUserOverridesPatch(raw, {
      healthReminders: { drink: { file: "custom.svg", durationMs: 6000 } },
    });
    assert.equal(patched.healthReminders.drink.file, "custom.svg");
    assert.equal(patched.healthReminders.drink.duration, 6000);
  });

  it("leaves healthReminders untouched when there is no override", () => {
    const raw = { healthReminders: { drink: { file: "a.svg" } } };
    const patched = applyUserOverridesPatch(raw, {});
    assert.equal(patched.healthReminders.drink.file, "a.svg");
  });
});
