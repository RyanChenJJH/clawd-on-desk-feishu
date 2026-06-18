"use strict";

// Every canonical health animation key must have a localized override-slot label
// (animHealth<Key>) in EVERY supported language. Guards the key-list ↔ i18n
// boundary so V2-P2's new keys (breathe/posture/walk/snack/sleeptime) can't ship
// with a missing or untranslated trigger label.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("fs");
const path = require("path");
const vm = require("node:vm");

const { SUPPORTED_LANGS } = require("../src/i18n");
const { HEALTH_ANIMATION_KEYS } = require("../src/health-reminder/animation-keys");

function loadSettingsStrings() {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "settings-i18n.js"), "utf8");
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.ClawdSettingsI18n.STRINGS;
}

function labelKey(key) {
  return "animHealth" + key.charAt(0).toUpperCase() + key.slice(1);
}

describe("health animation key i18n labels", () => {
  const STRINGS = loadSettingsStrings();
  for (const lang of SUPPORTED_LANGS) {
    it(`${lang}: every animation key has a non-empty label`, () => {
      for (const key of HEALTH_ANIMATION_KEYS) {
        const lk = labelKey(key);
        const val = STRINGS[lang] && STRINGS[lang][lk];
        assert.equal(typeof val, "string", `${lang} missing ${lk}`);
        assert.ok(val.trim().length > 0, `${lang}.${lk} is empty`);
      }
    });
  }
});
