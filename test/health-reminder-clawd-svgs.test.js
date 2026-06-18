"use strict";

// Guards the bespoke clawd health-animation SVGs: each canonical key must have a
// well-formed, animated, correctly-baselined SMIL file. clawd is the only theme
// authored as hand-written SVG; cloudling (scripted) / calico (APNG) use fitting
// existing assets, so this guard is clawd-only by design.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("fs");
const path = require("path");

const { HEALTH_ANIMATION_KEYS } = require("../src/health-reminder/animation-keys");

const SVG_DIR = path.join(__dirname, "..", "assets", "svg");
const CLAWD_VIEWBOX = "-15 -25 45 45";

// Lightweight XML well-formedness check: strip comments/CDATA, then walk every
// tag keeping a stack. Catches unclosed/mismatched tags in hand-authored SVG.
function assertWellFormed(svg, label) {
  const stripped = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "");
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(stripped)) !== null) {
    const [, closing, name, attrs, selfClose] = m;
    if (closing) {
      const top = stack.pop();
      assert.equal(top, name, `${label}: </${name}> does not match <${top}>`);
    } else if (!selfClose) {
      stack.push(name);
    }
    // Each attribute name should appear at most once in a tag.
    const seen = new Set();
    for (const a of attrs.matchAll(/([\w:-]+)\s*=/g)) {
      assert.ok(!seen.has(a[1]), `${label}: duplicate attribute ${a[1]} on <${name}>`);
      seen.add(a[1]);
    }
  }
  assert.equal(stack.length, 0, `${label}: unclosed tags ${stack.join(", ")}`);
}

describe("clawd bespoke health SVGs", () => {
  for (const key of HEALTH_ANIMATION_KEYS) {
    const file = `clawd-health-${key}.svg`;
    it(`${file} exists, is well-formed, baselined and animated`, () => {
      const full = path.join(SVG_DIR, file);
      assert.ok(fs.existsSync(full), `missing ${file}`);
      const svg = fs.readFileSync(full, "utf8");
      assertWellFormed(svg, file);
      assert.ok(svg.includes(`viewBox="${CLAWD_VIEWBOX}"`), `${file}: wrong/absent viewBox`);
      assert.ok(svg.includes('repeatCount="indefinite"'), `${file}: not a looping animation`);
      assert.ok(svg.includes('fill="#DE886D"'), `${file}: not using the clawd body palette`);
      // Transforms must animate via <animateTransform>, never <animate attributeName="transform">.
      assert.ok(
        !/<animate\s[^>]*attributeName="transform"/.test(svg),
        `${file}: transform animated with <animate> instead of <animateTransform>`
      );
    });
  }
});
