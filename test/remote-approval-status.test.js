"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  formatRemoteApprovalStatusText,
  summarizeRemoteApprovalStatus,
} = require("../src/remote-approval/status");

test("remote approval status summarizes providers without leaking raw provider fields", () => {
  const status = summarizeRemoteApprovalStatus({
    pendingApprovalCount: 2,
    doNotDisturb: true,
    providers: [
      {
        id: "telegram",
        label: "Telegram",
        getStatus: () => ({
          configured: true,
          enabled: true,
          status: "running",
          token: "secret-token",
          recipientId: "123456789",
        }),
      },
      {
        id: "feishu",
        label: "Feishu",
        getStatus: () => ({
          configured: false,
          enabled: false,
          status: "stopped",
          lastError: { message: "missing recipient" },
          appSecret: "secret-value",
        }),
      },
    ],
  });

  assert.deepEqual(status, {
    pendingApprovalCount: 2,
    doNotDisturb: true,
    providers: [
      {
        id: "telegram",
        label: "Telegram",
        configured: true,
        enabled: true,
        status: "running",
      },
      {
        id: "feishu",
        label: "Feishu",
        configured: false,
        enabled: false,
        status: "stopped",
        lastErrorMessage: "missing recipient",
      },
    ],
  });
  assert.equal(JSON.stringify(status).includes("secret"), false);
  assert.equal(JSON.stringify(status).includes("123456789"), false);
});

test("remote approval status text formats plain summaries and redacts recent errors", () => {
  const text = formatRemoteApprovalStatusText({
    pendingApprovalCount: 3,
    doNotDisturb: false,
    providers: [
      {
        id: "feishu",
        label: "Feishu",
        configured: true,
        enabled: true,
        status: "running",
        pendingApprovalCount: 1,
        lastErrorMessage: "failed token=123456:abcdefghijklmnopqrstuvwxyz chat_id=oc_secret123 open_id=ou_secret456",
      },
    ],
  });

  assert.match(text, /Clawd remote approval status/);
  assert.match(text, /DND: off/);
  assert.match(text, /Pending approvals: 3/);
  assert.match(text, /Feishu: running/);
  assert.match(text, /Recent errors:/);
  assert.doesNotMatch(text, /123456:abcdefghijklmnopqrstuvwxyz/);
  assert.doesNotMatch(text, /oc_secret123/);
  assert.doesNotMatch(text, /ou_secret456/);
});
