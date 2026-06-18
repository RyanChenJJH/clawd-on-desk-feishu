"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRemoteSuggestionButtons,
  buildRemoteSuggestionLabel,
} = require("../src/remote-approval/payload");

test("remote approval payload builds stable rich suggestion labels", () => {
  assert.equal(buildRemoteSuggestionLabel({
    type: "addRules",
    behavior: "allow",
    rules: [{ toolName: "Bash", ruleContent: "npm test" }],
  }), "Always Bash");
  assert.equal(buildRemoteSuggestionLabel({
    type: "addRules",
    behavior: "deny",
    rules: [{ toolName: "Read", ruleContent: "*" }],
  }), "Always deny Read");
  assert.equal(buildRemoteSuggestionLabel({
    type: "setMode",
    mode: "acceptEdits",
  }), "Auto edits");
});

test("remote approval payload hides duplicate, empty, and unsupported suggestion buttons", () => {
  const buttons = buildRemoteSuggestionButtons([
    { type: "addRules", behavior: "allow", rules: [{ toolName: "Bash" }] },
    { type: "addRules", behavior: "allow", rules: [{ toolName: "Bash" }] },
    { type: "setMode", mode: "plan" },
    { type: "unknown" },
  ]);

  assert.deepEqual(buttons, [
    { index: 0, label: "Always Bash" },
    { index: 2, label: "Plan mode" },
  ]);
});
