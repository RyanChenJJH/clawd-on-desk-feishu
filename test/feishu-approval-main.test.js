"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createFeishuApprovalMain,
} = require("../src/feishu-approval-main");

function makeRunner() {
  const calls = [];
  let enabled = false;
  return {
    calls,
    runner: {
      isEnabled: () => enabled,
      start: async () => {
        calls.push({ type: "start" });
        enabled = true;
        return { status: "ok" };
      },
      stop: async () => {
        calls.push({ type: "stop" });
        enabled = false;
        return { status: "ok" };
      },
      requestApproval: async (payload, options) => {
        calls.push({ type: "requestApproval", payload, options });
        return { action: "allow" };
      },
      sendNotification: async (text) => {
        calls.push({ type: "sendNotification", text });
        return { ok: true, messageId: "om_done" };
      },
      sendTestCard: async () => {
        calls.push({ type: "sendTestCard" });
        return { status: "ok", decision: "deny" };
      },
      getStatus: () => ({
        started: enabled,
        enabled,
        pendingApprovalCount: 0,
        lastError: null,
      }),
    },
  };
}

test("Feishu approval main runtime stays stopped and exposes no provider when disabled", async () => {
  const fake = makeRunner();
  const runtime = createFeishuApprovalMain({
    getConfig: () => ({
      enabled: false,
      region: "feishu",
      receiveIdType: "chat_id",
      receiveId: "oc_target",
      allowedOpenId: "ou_approver",
      allowedUserId: "",
      notifyOnComplete: false,
    }),
    getCredentials: () => ({ appId: "cli_testapp", appSecret: "secret-value" }),
    createRunner: () => fake.runner,
  });

  const result = await runtime.sync("startup");

  assert.deepEqual(result, { status: "skipped", reason: "disabled" });
  assert.deepEqual(fake.calls, []);
  assert.equal(runtime.getClient(), null);
  assert.equal(runtime.getStatus().status, "stopped");
});

test("Feishu approval main runtime starts a ready runner and exposes a broker provider", async () => {
  const fake = makeRunner();
  const runtime = createFeishuApprovalMain({
    getConfig: () => ({
      enabled: true,
      region: "feishu",
      receiveIdType: "chat_id",
      receiveId: "oc_target",
      allowedOpenId: "ou_approver",
      allowedUserId: "",
      notifyOnComplete: false,
    }),
    getCredentials: () => ({ appId: "cli_testapp", appSecret: "secret-value" }),
    createRunner: () => fake.runner,
  });

  const result = await runtime.sync("settings");
  const client = runtime.getClient();
  const decision = await client.requestApproval({ title: "x", detail: "y" }, { signal: null });
  const notification = await client.sendNotification("done");

  assert.deepEqual(result, { status: "ok" });
  assert.equal(client.id, "feishu");
  assert.equal(client.isEnabled(), true);
  assert.deepEqual(decision, { action: "allow" });
  assert.deepEqual(notification, { ok: true, messageId: "om_done" });
  assert.deepEqual(fake.calls.map((call) => call.type), ["start", "requestApproval", "sendNotification"]);
  assert.equal(runtime.getStatus().status, "running");
});

test("Feishu approval main runtime stops an existing runner when config becomes incomplete", async () => {
  const fake = makeRunner();
  let config = {
    enabled: true,
    region: "feishu",
    receiveIdType: "chat_id",
    receiveId: "oc_target",
    allowedOpenId: "ou_approver",
    allowedUserId: "",
    notifyOnComplete: false,
  };
  const runtime = createFeishuApprovalMain({
    getConfig: () => config,
    getCredentials: () => ({ appId: "cli_testapp", appSecret: "secret-value" }),
    createRunner: () => fake.runner,
  });

  await runtime.sync("settings");
  config = { ...config, receiveId: "" };
  const result = await runtime.sync("settings");

  assert.deepEqual(result, { status: "skipped", reason: "missing-recipient" });
  assert.deepEqual(fake.calls.map((call) => call.type), ["start", "stop"]);
  assert.equal(runtime.getClient(), null);
});

test("Feishu approval main runtime sends test cards through the runner only when ready", async () => {
  const fake = makeRunner();
  const runtime = createFeishuApprovalMain({
    getConfig: () => ({
      enabled: true,
      region: "feishu",
      receiveIdType: "chat_id",
      receiveId: "oc_target",
      allowedOpenId: "ou_approver",
      allowedUserId: "",
      notifyOnComplete: false,
    }),
    getCredentials: () => ({ appId: "cli_testapp", appSecret: "secret-value" }),
    createRunner: () => fake.runner,
  });

  const result = await runtime.sendTest();

  assert.deepEqual(result, { status: "ok", decision: "deny" });
  assert.deepEqual(fake.calls.map((call) => call.type), ["start", "sendTestCard"]);
});

test("Feishu approval main runtime passes status summary provider to the runner", async () => {
  const fake = makeRunner();
  let runnerOptions = null;
  const statusSummary = {
    pendingApprovalCount: 1,
    doNotDisturb: true,
    providers: [],
  };
  const runtime = createFeishuApprovalMain({
    getConfig: () => ({
      enabled: true,
      region: "feishu",
      receiveIdType: "chat_id",
      receiveId: "oc_target",
      allowedOpenId: "ou_approver",
      allowedUserId: "",
      notifyOnComplete: false,
    }),
    getCredentials: () => ({ appId: "cli_testapp", appSecret: "secret-value" }),
    createRunner: (options) => {
      runnerOptions = options;
      return fake.runner;
    },
    getStatusSummary: () => statusSummary,
  });

  await runtime.sync("settings");

  assert.equal(typeof runnerOptions.getStatusSummary, "function");
  assert.strictEqual(runnerOptions.getStatusSummary(), statusSummary);
});

test("Feishu approval main runtime redacts recent runner errors in status", async () => {
  const rawError = "request failed appSecret=secret-value receive_id=oc_target123456 open_id=ou_approver123456";
  const runtime = createFeishuApprovalMain({
    getConfig: () => ({
      enabled: true,
      region: "feishu",
      receiveIdType: "chat_id",
      receiveId: "oc_target",
      allowedOpenId: "ou_approver",
      allowedUserId: "",
      notifyOnComplete: false,
    }),
    getCredentials: () => ({ appId: "cli_testapp", appSecret: "secret-value" }),
    createRunner: () => ({
      isEnabled: () => false,
      start: async () => ({ status: "error", message: rawError }),
      getStatus: () => ({
        started: false,
        enabled: false,
        pendingApprovalCount: 0,
        lastError: { message: rawError },
      }),
    }),
  });

  await runtime.sync("settings");
  const status = runtime.getStatus();
  const text = JSON.stringify(status);

  assert.equal(status.status, "failed");
  assert.match(status.message, /<redacted>/);
  assert.ok(!text.includes("secret-value"));
  assert.ok(!text.includes("oc_target123456"));
  assert.ok(!text.includes("ou_approver123456"));
});
