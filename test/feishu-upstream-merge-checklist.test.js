"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.join(__dirname, "..");
const checklistPath = path.join(
  repoRoot,
  "docs",
  "Expand_function",
  "feishu",
  "upstream-merge-checklist.md",
);

test("Feishu upstream merge checklist covers conflicts, rollback, and regression commands", () => {
  const text = fs.readFileSync(checklistPath, "utf8");

  for (const required of [
    "src/main.js",
    "src/permission.js",
    "src/prefs.js",
    "src/settings-actions.js",
    "src/settings-tab-telegram-approval.js",
    "package.json",
    "src/remote-approval/",
    "feishuApproval.enabled=false",
    "npm test",
    "test\\feishu-approval-runner.test.js",
    "test\\permission-remote-approval.test.js",
    "test\\settings-renderer-browser-env.test.js",
    "Telegram",
    "local permission bubble",
    "DND",
    "agent hooks",
  ]) {
    assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(text, /app_secret\s*=/i);
  assert.doesNotMatch(text, /CLAWD_FEISHU_APP_SECRET\s*=/i);
});

