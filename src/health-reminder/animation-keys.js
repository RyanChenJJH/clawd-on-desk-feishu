"use strict";

// Single source of truth for health-reminder animation keys.
// v1 shipped the first five; v2 (V2-P2) adds breathe/posture/walk/snack/sleeptime.
// Every theme's `theme.json.healthReminders` must define an entry for each key
// (bespoke art where available, a fitting fallback asset otherwise), and the
// settings animationKey dropdown offers all of them (plus the "none" / bubble-only
// sentinel, which is not an animation asset and so is NOT in this list).
// No Electron / Node-host dependencies — safe to require from pure logic and tests.

const HEALTH_ANIMATION_KEYS = [
  "drink",
  "stretch",
  "eat",
  "offwork",
  "eyerest",
  "breathe",
  "posture",
  "walk",
  "snack",
  "sleeptime",
];

module.exports = { HEALTH_ANIMATION_KEYS };
