"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  checkFeishuApprovalStatus,
  buildFeishuApprovalDiagnostic,
} = require("../src/feishu-approval-runtime-status");

test("Feishu approval diagnostic is quiet when the feature is disabled", () => {
  const diagnostic = buildFeishuApprovalDiagnostic({
    config: { enabled: false },
    credentials: { credentialsConfigured: false },
    runtimeStatus: null,
  });

  assert.deepEqual(diagnostic, {
    enabled: false,
    configured: false,
    status: "disabled",
    health: "off",
    detail: "Feishu approval is disabled",
    hints: [],
    recentError: "",
  });
});

test("Feishu approval Doctor check reports missing setup without leaking configured IDs", () => {
  const check = checkFeishuApprovalStatus({
    prefs: {
      feishuApproval: {
        enabled: true,
        region: "feishu",
        receiveIdType: "chat_id",
        receiveId: "oc_secret_room",
        allowedOpenId: "ou_secret_approver",
        allowedUserId: "",
      },
    },
    credentials: {
      credentialsConfigured: false,
      appSecret: "secret-value-should-not-leak",
    },
    runtimeStatus: {
      status: "failed",
      lastError: {
        message: "API rejected app_secret=secret-value-should-not-leak receive_id=oc_secret_room",
      },
    },
  });
  const text = JSON.stringify(check);

  assert.equal(check.id, "feishu-approval");
  assert.equal(check.status, "fail");
  assert.equal(check.level, "warning");
  assert.match(check.detail, /credentials/i);
  assert.match(check.textHint, /Configure Feishu App ID and App Secret/i);
  assert.equal(text.includes("secret-value-should-not-leak"), false);
  assert.equal(text.includes("oc_secret_room"), false);
  assert.equal(text.includes("ou_secret_approver"), false);
});
