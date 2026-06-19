"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const settings = require("../src/feishu-approval-settings");

const tempDirs = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-feishu-approval-"));
  tempDirs.push(dir);
  return dir;
}

test.afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

test("normalizeFeishuApproval defaults off and trims first-version fields", () => {
  assert.deepEqual(settings.normalizeFeishuApproval({
    enabled: true,
    region: " LARK ",
    receiveIdType: " OPEN_ID ",
    receiveId: " ou_target ",
    allowedOpenId: " ou_allowed ",
    allowedUserId: " user_allowed ",
    notifyOnComplete: true,
    completionOutputMode: " full ",
    statusCommandEnabled: false,
    appSecret: "must-not-survive",
  }), {
    enabled: true,
    region: "lark",
    receiveIdType: "open_id",
    receiveId: "ou_target",
    allowedOpenId: "ou_allowed",
    allowedUserId: "user_allowed",
    recipients: [],
    notifyOnComplete: true,
    completionOutputMode: "full",
    statusCommandEnabled: false,
    elicitationEnabled: false,
  });
  assert.equal(settings.normalizeFeishuApproval({}).statusCommandEnabled, true);
});

// v3.2: real approval cards never self-timeout (they persist until the user
// acts on the card or on the desktop), so the approvalTimeoutSeconds config was
// removed entirely. Normalize must not resurrect it.
test("normalizeFeishuApproval no longer emits approvalTimeoutSeconds (v3.2 removed)", () => {
  assert.equal("approvalTimeoutSeconds" in settings.normalizeFeishuApproval({}), false);
  assert.equal("approvalTimeoutSeconds" in settings.normalizeFeishuApproval({ approvalTimeoutSeconds: 120 }), false);
});

test("normalizeFeishuApproval defaults elicitationEnabled off and coerces booleans", () => {
  assert.equal(settings.normalizeFeishuApproval({}).elicitationEnabled, false);
  assert.equal(settings.normalizeFeishuApproval({ elicitationEnabled: true }).elicitationEnabled, true);
  assert.equal(settings.normalizeFeishuApproval({ elicitationEnabled: "yes" }).elicitationEnabled, false);
});

test("validateFeishuApproval rejects approvalTimeoutSeconds as an unsupported key (v3.2 removed)", () => {
  const result = settings.validateFeishuApproval({ enabled: false, approvalTimeoutSeconds: 600 });
  assert.equal(result.status, "error");
  assert.match(result.message, /approvalTimeoutSeconds.*not supported/);
});

test("validateFeishuApproval accepts boolean elicitationEnabled and rejects non-boolean", () => {
  assert.equal(settings.validateFeishuApproval({ enabled: false, elicitationEnabled: true }).status, "ok");
  assert.equal(settings.validateFeishuApproval({ enabled: false, elicitationEnabled: "true" }).status, "error");
});

test("normalizeFeishuApproval preserves valid multi-recipient entries without secrets", () => {
  assert.deepEqual(settings.normalizeFeishuApproval({
    enabled: true,
    region: "feishu",
    receiveIdType: "chat_id",
    receiveId: "oc_legacy",
    allowedOpenId: "ou_legacy",
    recipients: [
      {
        receiveIdType: " open_id ",
        receiveId: " ou_target ",
        allowedOpenId: " ou_approver ",
        allowedUserId: "",
        appSecret: "must-not-survive",
      },
      {
        receiveIdType: "bad",
        receiveId: " user_target ",
        allowedOpenId: "",
        allowedUserId: " u_approver ",
      },
      null,
    ],
  }).recipients, [
    {
      receiveIdType: "open_id",
      receiveId: "ou_target",
      allowedOpenId: "ou_approver",
      allowedUserId: "",
    },
    {
      receiveIdType: "chat_id",
      receiveId: "user_target",
      allowedOpenId: "",
      allowedUserId: "u_approver",
    },
  ]);
});

test("validateFeishuApproval allows incomplete saved config but rejects malformed fields", () => {
  assert.equal(settings.validateFeishuApproval({
    enabled: false,
    region: "feishu",
    receiveIdType: "chat_id",
    receiveId: "",
    allowedOpenId: "",
    allowedUserId: "",
  }).status, "ok");
  assert.equal(settings.validateFeishuApproval({
    enabled: true,
    region: "lark",
    receiveIdType: "open_id",
    receiveId: "ou_xxx",
    allowedOpenId: "ou_allowed",
    notifyOnComplete: true,
    completionOutputMode: "full",
    statusCommandEnabled: true,
    recipients: [{
      receiveIdType: "chat_id",
      receiveId: "oc_extra",
      allowedOpenId: "ou_extra",
      allowedUserId: "",
    }],
  }).status, "ok");
  assert.equal(settings.validateFeishuApproval({
    enabled: true,
    region: "global",
    receiveIdType: "chat_id",
  }).status, "error");
  assert.equal(settings.validateFeishuApproval({
    enabled: true,
    region: "feishu",
    receiveIdType: "email",
  }).status, "error");
  assert.equal(settings.validateFeishuApproval({
    enabled: true,
    region: "feishu",
    receiveIdType: "chat_id",
    appSecret: "must-not-save",
  }).status, "error");
  assert.equal(settings.validateFeishuApproval({
    enabled: true,
    region: "feishu",
    receiveIdType: "chat_id",
    notifyOnComplete: "yes",
  }).status, "error");
  assert.equal(settings.validateFeishuApproval({
    enabled: true,
    region: "feishu",
    receiveIdType: "chat_id",
    completionOutputMode: "summary",
  }).status, "error");
  assert.equal(settings.validateFeishuApproval({
    enabled: true,
    region: "feishu",
    receiveIdType: "chat_id",
    statusCommandEnabled: "yes",
  }).status, "error");
  assert.equal(settings.validateFeishuApproval({
    enabled: true,
    region: "feishu",
    receiveIdType: "chat_id",
    recipients: "oc_extra",
  }).status, "error");
  assert.equal(settings.validateFeishuApproval({
    enabled: true,
    region: "feishu",
    receiveIdType: "chat_id",
    recipients: [{ receiveIdType: "email", receiveId: "x" }],
  }).status, "error");
});

test("readiness requires enabled config, credentials, recipient, and approver", () => {
  assert.equal(settings.readiness({ enabled: false }, { credentialsConfigured: true }).reason, "disabled");
  assert.equal(settings.readiness({
    enabled: true,
    receiveId: "oc_xxx",
    allowedOpenId: "ou_allowed",
  }, { credentialsConfigured: false }).reason, "missing-credentials");
  assert.equal(settings.readiness({
    enabled: true,
    allowedOpenId: "ou_allowed",
  }, { credentialsConfigured: true }).reason, "missing-recipient");
  assert.equal(settings.readiness({
    enabled: true,
    receiveId: "oc_xxx",
  }, { credentialsConfigured: true }).reason, "missing-approver");
  assert.equal(settings.readiness({
    enabled: true,
    recipients: [{
      receiveIdType: "chat_id",
      receiveId: "oc_xxx",
      allowedUserId: "u_allowed",
    }],
  }, { credentialsConfigured: true }).ready, true);
});

test("writeCredentialsEnvFile stores app credentials outside prefs", () => {
  const filePath = path.join(tempDir(), "feishu-approval.env");
  const result = settings.writeCredentialsEnvFile({
    fs,
    path,
    filePath,
    appId: "cli_a123456789",
    appSecret: "secret-value-123456",
    platform: "linux",
  });

  assert.equal(result.status, "ok");
  assert.equal(fs.readFileSync(filePath, "utf8"), [
    "CLAWD_FEISHU_APP_ID=cli_a123456789",
    "CLAWD_FEISHU_APP_SECRET=secret-value-123456",
    "",
  ].join("\n"));
});

test("credentialsStatus checks file presence without reading credentials", () => {
  const calls = [];
  const fakeFs = {
    existsSync(filePath) {
      calls.push(["existsSync", filePath]);
      return true;
    },
    statSync(filePath) {
      calls.push(["statSync", filePath]);
      return { mtimeMs: 123 };
    },
    readFileSync() {
      calls.push(["readFileSync"]);
      throw new Error("should not read credentials");
    },
  };

  assert.deepEqual(settings.credentialsStatus({ fs: fakeFs, filePath: "feishu-approval.env" }), {
    credentialsConfigured: true,
    credentialsStored: true,
    credentialsFileMtimeMs: 123,
  });
  assert.deepEqual(calls, [
    ["existsSync", "feishu-approval.env"],
    ["statSync", "feishu-approval.env"],
  ]);
});

test("readCredentialsInfo returns app id and masked secret only", () => {
  const filePath = path.join(tempDir(), "feishu-approval.env");
  fs.writeFileSync(filePath, [
    "CLAWD_FEISHU_APP_ID=cli_a123456789",
    "CLAWD_FEISHU_APP_SECRET=secret-value-123456",
    "",
  ].join("\n"), "utf8");

  const info = settings.readCredentialsInfo({ fs, filePath });
  assert.deepEqual(info, {
    configured: true,
    appId: "cli_a123456789",
    maskedAppSecret: "secr...3456",
  });
  assert.equal(JSON.stringify(info).includes("secret-value-123456"), false);
});

test("readCredentialsEnvFile returns raw credentials for main process runner use", () => {
  const filePath = path.join(tempDir(), "feishu-approval.env");
  fs.writeFileSync(filePath, [
    "CLAWD_FEISHU_APP_ID=cli_a123456789",
    "CLAWD_FEISHU_APP_SECRET=secret-value-123456",
    "",
  ].join("\n"), "utf8");

  assert.deepEqual(settings.readCredentialsEnvFile({ fs, filePath }), {
    appId: "cli_a123456789",
    appSecret: "secret-value-123456",
  });
});

test("maskFeishuSecret uses an ascii placeholder for short secrets", () => {
  assert.equal(settings.maskFeishuSecret("short"), "******");
});

test("redactionSecretsForFeishuApproval includes recipient and approver ids", () => {
  assert.deepEqual(settings.redactionSecretsForFeishuApproval({
    receiveId: "oc_chat",
    allowedOpenId: "ou_allowed",
    allowedUserId: "u_allowed",
    recipients: [{
      receiveId: "oc_extra",
      allowedOpenId: "ou_extra",
      allowedUserId: "u_extra",
    }],
  }), ["oc_chat", "ou_allowed", "u_allowed", "oc_extra", "ou_extra", "u_extra"]);
});
