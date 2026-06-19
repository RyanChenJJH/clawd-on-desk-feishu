"use strict";

const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const test = require("node:test");

const {
  assertFeishuSdkCapabilities,
  buildSpikeApprovalCard,
  loadFeishuSdk,
  normalizeSpikeConfig,
  parseSpikeCardAction,
  runFeishuSdkSpike,
} = require("../src/feishu-sdk-spike");

function fakeSdk(channel) {
  return {
    Domain: { Feishu: "feishu-domain", Lark: "lark-domain" },
    LoggerLevel: { info: "info", warn: "warn" },
    Client: function Client() {},
    WSClient: function WSClient() {},
    EventDispatcher: function EventDispatcher() {},
    createLarkChannel(options) {
      channel.options = options;
      return channel;
    },
  };
}

function makeFakeChannel({ callbackValue, sender = { openId: "ou_1", userId: "u_1" } } = {}) {
  const channel = new EventEmitter();
  channel.connected = false;
  channel.disconnected = false;
  channel.sent = [];
  channel.connect = async () => {
    channel.connected = true;
  };
  channel.disconnect = async () => {
    channel.disconnected = true;
  };
  channel.send = async (chatId, input) => {
    channel.sent.push({ chatId, input });
    if (callbackValue) {
      setImmediate(() => {
        channel.emit("cardAction", {
          value: callbackValue,
          operator: {
            open_id: sender.openId,
            user_id: sender.userId,
          },
        });
      });
    }
    return { messageId: "om_fake" };
  };
  return channel;
}

test("loadFeishuSdk reports a missing dependency without throwing", () => {
  const result = loadFeishuSdk(() => {
    const err = new Error("Cannot find module '@larksuiteoapi/node-sdk'");
    err.code = "MODULE_NOT_FOUND";
    throw err;
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "SDK_MISSING");
  assert.match(result.message, /npm install @larksuiteoapi\/node-sdk/);
});

test("installed @larksuiteoapi/node-sdk exposes the CommonJS Channel API", () => {
  const result = loadFeishuSdk();

  assert.equal(result.status, "ok");
  assert.equal(result.capabilities.hasCreateLarkChannel, true);
  assert.equal(result.capabilities.hasClient, true);
  assert.equal(result.capabilities.hasWSClient, true);
});

test("assertFeishuSdkCapabilities accepts the CommonJS channel SDK shape", () => {
  const capabilities = assertFeishuSdkCapabilities(fakeSdk(makeFakeChannel()));

  assert.deepEqual(capabilities, {
    hasClient: true,
    hasEventDispatcher: true,
    hasCreateLarkChannel: true,
    hasWSClient: true,
  });
});

test("normalizeSpikeConfig defaults region to feishu and keeps secrets out of safe summary", () => {
  const config = normalizeSpikeConfig({
    appId: " cli_xxx ",
    appSecret: " secret ",
    receiveId: " oc_xxx ",
    allowedOpenId: " ou_1 ",
  });

  assert.equal(config.region, "feishu");
  assert.equal(config.receiveIdType, "chat_id");
  assert.equal(config.appSecret, "secret");
  assert.deepEqual(config.safeSummary, {
    appIdConfigured: true,
    appSecretConfigured: true,
    receiveIdType: "chat_id",
    receiveIdConfigured: true,
    allowedOpenIdConfigured: true,
    allowedUserIdConfigured: false,
    region: "feishu",
    timeoutMs: 60000,
  });
  assert.equal(JSON.stringify(config.safeSummary).includes("secret"), false);
});

test("buildSpikeApprovalCard uses cardkit v2 callback buttons", () => {
  const card = buildSpikeApprovalCard({
    nonce: "abc123",
    title: "Clawd Feishu approval test",
    detail: "Tap a button to verify callbacks.",
  });

  assert.equal(card.schema, "2.0");
  assert.equal(card.header.title.content, "Clawd Feishu approval test");

  const buttonRow = card.body.elements.find((entry) => entry.tag === "column_set");
  assert.ok(buttonRow, "expected a v2 column_set button row");
  const buttons = buttonRow.columns.map((column) => column.elements[0]);

  assert.deepEqual(buttons.map((button) => button.text.content), ["Allow once", "Deny"]);
  assert.deepEqual(buttons.map((button) => button.behaviors[0]), [
    { type: "callback", value: "clawd:approval:abc123:allow" },
    { type: "callback", value: "clawd:approval:abc123:deny" },
  ]);
});

test("parseSpikeCardAction extracts allow and approver ids from normalized channel events", () => {
  assert.deepEqual(parseSpikeCardAction({
    value: "clawd:approval:n123:allow",
    operator: { open_id: "ou_1", user_id: "u_1" },
  }), {
    nonce: "n123",
    action: "allow",
    openId: "ou_1",
    userId: "u_1",
  });

  assert.equal(parseSpikeCardAction({ value: "unrelated" }), null);
});

test("parseSpikeCardAction accepts the SDK CardActionEvent shape", () => {
  assert.deepEqual(parseSpikeCardAction({
    messageId: "om_1",
    chatId: "oc_1",
    operator: { openId: "ou_1", userId: "u_1" },
    action: {
      tag: "button",
      value: "clawd:approval:n123:deny",
    },
  }), {
    nonce: "n123",
    action: "deny",
    openId: "ou_1",
    userId: "u_1",
  });
});

test("runFeishuSdkSpike sends a card and resolves the first matching decision", async () => {
  const channel = makeFakeChannel({ callbackValue: "clawd:approval:fixed:allow" });

  const result = await runFeishuSdkSpike({
    appId: "cli_xxx",
    appSecret: "secret",
    receiveId: "oc_xxx",
    allowedOpenId: "ou_1",
    timeoutMs: 500,
  }, {
    sdk: fakeSdk(channel),
    randomId: () => "fixed",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.decision, "allow");
  assert.equal(channel.connected, true);
  assert.equal(channel.disconnected, true);
  assert.equal(channel.options.domain, "feishu-domain");
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].chatId, "oc_xxx");
  assert.equal(channel.sent[0].input.card.schema, "2.0");
});

test("runFeishuSdkSpike ignores unauthorized card taps until timeout", async () => {
  const channel = makeFakeChannel({
    callbackValue: "clawd:approval:fixed:deny",
    sender: { openId: "ou_wrong", userId: "u_wrong" },
  });

  const result = await runFeishuSdkSpike({
    appId: "cli_xxx",
    appSecret: "secret",
    receiveId: "oc_xxx",
    allowedOpenId: "ou_1",
    timeoutMs: 10,
  }, {
    sdk: fakeSdk(channel),
    randomId: () => "fixed",
  });

  assert.equal(result.status, "timeout");
  assert.equal(channel.disconnected, true);
});

test("runFeishuSdkSpike rejects unsupported receive id types for the phase 1 channel spike", async () => {
  const result = await runFeishuSdkSpike({
    appId: "cli_xxx",
    appSecret: "secret",
    receiveIdType: "open_id",
    receiveId: "ou_xxx",
  }, {
    sdk: fakeSdk(makeFakeChannel()),
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "UNSUPPORTED_RECEIVE_ID_TYPE");
});
