"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const MAIN_JS = path.join(__dirname, "..", "src", "main.js");

test("main wires Feishu approval runtime into lifecycle, settings, and remote providers", () => {
  const source = fs.readFileSync(MAIN_JS, "utf8");

  assert.match(source, /createFeishuApprovalMain/);
  assert.match(source, /createRemoteApprovalProviderRegistry/);
  assert.match(source, /createRemoteApprovalCompletionNotifier/);
  assert.match(source, /summarizeRemoteApprovalStatus/);
  assert.match(source, /createTelegramApprovalProvider/);
  assert.match(source, /createFeishuApprovalProvider/);
  assert.match(source, /function getFeishuApprovalClient\(\)/);
  assert.match(source, /listApprovalProviders\(\)/);
  assert.match(source, /function buildFeishuStatusCommandSummary\(\)/);
  assert.match(source, /getStatusSummary: \(\) => buildFeishuStatusCommandSummary\(\)/);
  assert.match(source, /getFeishuApprovalCredentialsStatus: \(\) => getFeishuApprovalCredentialsStatus\(\)/);
  assert.match(source, /getFeishuApprovalStatus: \(\) => getFeishuApprovalStatus\(\)/);
  assert.match(source, /feishuCompanion\.onSnapshot\(snapshot\)/);
  assert.match(source, /subscribeKey\("feishuApproval"/);
  assert.match(source, /queueFeishuApprovalRuntimeSync\("startup"\)/);
  assert.match(source, /stopFeishuApprovalRuntime\(\)/);
});
