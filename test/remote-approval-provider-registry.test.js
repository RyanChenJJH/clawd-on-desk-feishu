"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createRemoteApprovalProviderRegistry,
} = require("../src/remote-approval/provider-registry");
const {
  createTelegramApprovalProvider,
} = require("../src/remote-approval/providers/telegram-provider");
const {
  createFeishuApprovalProvider,
} = require("../src/remote-approval/providers/feishu-provider");

function makeClient(id, enabled = true) {
  const calls = [];
  return {
    id,
    calls,
    isEnabled: () => enabled,
    requestApproval(payload, options) {
      calls.push({ payload, options });
      return Promise.resolve({ action: "allow" });
    },
  };
}

test("remote approval provider registry exposes enabled Telegram and Feishu providers", async () => {
  const payload = { title: "claude-code requests Bash", detail: "Summary: Run tests" };
  const telegramClient = makeClient("telegram-client");
  const feishuClient = makeClient("feishu-client");
  const disabledClient = makeClient("disabled-client", false);

  const registry = createRemoteApprovalProviderRegistry({
    providers: [
      createTelegramApprovalProvider({ getClient: () => telegramClient }),
      createFeishuApprovalProvider({ getClient: () => feishuClient }),
      { id: "disabled", label: "Disabled", getClient: () => disabledClient },
      createFeishuApprovalProvider({ getClient: () => null }),
    ],
  });

  const providers = registry.listApprovalProviders();

  assert.deepEqual(providers.map((provider) => provider.id), ["telegram", "feishu"]);
  assert.deepEqual(providers.map((provider) => provider.label), ["Telegram", "Feishu"]);
  assert.deepEqual(providers.map((provider) => provider.capabilities.supportsRichApproval), [true, true]);

  const decision = await providers[1].requestApproval(payload, { signal: null });

  assert.deepEqual(decision, { action: "allow" });
  assert.deepEqual(feishuClient.calls, [{ payload, options: { signal: null } }]);
  assert.deepEqual(telegramClient.calls, []);
});
