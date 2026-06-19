"use strict";

// V2-P1: every theme's healthReminders entry must point to an asset that
// actually exists, and cloudling/calico must be SPECIALIZED (per-key mapping
// to fitting existing art) rather than every key pointing at one fallback.
// clawd ships bespoke per-key SMIL already; cloudling (scripted SVG) and calico
// (APNG) keep semantic fallbacks until bespoke art lands via the override slot.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("fs");
const path = require("path");

const { HEALTH_ANIMATION_KEYS } = require("../src/health-reminder/animation-keys");

const ROOT = path.join(__dirname, "..");

// clawd is the built-in theme: bare filenames resolve under assets/svg/.
// Other themes carry their own themes/<id>/assets/ directory.
function assetDir(themeId) {
  return themeId === "clawd"
    ? path.join(ROOT, "assets", "svg")
    : path.join(ROOT, "themes", themeId, "assets");
}

function readHealthReminders(themeId) {
  const theme = JSON.parse(
    fs.readFileSync(path.join(ROOT, "themes", themeId, "theme.json"), "utf8")
  );
  return theme.healthReminders || {};
}

const THEMES = ["clawd", "cloudling", "calico"];

describe("theme healthReminders asset wiring", () => {
  for (const themeId of THEMES) {
    it(`${themeId}: defines every canonical health animation key`, () => {
      const hr = readHealthReminders(themeId);
      for (const key of HEALTH_ANIMATION_KEYS) {
        assert.ok(hr[key], `${themeId} healthReminders missing key "${key}"`);
      }
    });
  }

  for (const themeId of THEMES) {
    it(`${themeId}: every referenced asset file exists on disk`, () => {
      const hr = readHealthReminders(themeId);
      const keys = Object.keys(hr);
      assert.ok(keys.length > 0, `${themeId} has no healthReminders block`);
      for (const key of keys) {
        const file = hr[key] && hr[key].file;
        assert.ok(file, `${themeId}.${key} missing file`);
        const full = path.join(assetDir(themeId), file);
        assert.ok(fs.existsSync(full), `${themeId}.${key} -> missing asset ${file}`);
      }
    });
  }

  for (const themeId of ["cloudling", "calico"]) {
    it(`${themeId}: health animations are specialized (not one shared fallback)`, () => {
      const hr = readHealthReminders(themeId);
      const files = Object.values(hr).map((e) => e.file);
      const distinct = new Set(files);
      assert.ok(
        distinct.size >= 3,
        `${themeId} healthReminders should map keys to distinct fitting assets, got ${distinct.size} distinct (${[...distinct].join(", ")})`
      );
    });
  }
});
