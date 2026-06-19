"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createFeishuApprovalRunner,
  createSdkChannel,
  domainForRegion,
} = require("../src/feishu-approval-runner");
const { createFakeFeishuChannel } = require("./fakes/feishu-channel");

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baseConfig(extra = {}) {
  return {
    enabled: true,
    region: "feishu",
    receiveIdType: "chat_id",
    receiveId: "oc_123",
    allowedOpenId: "ou_allowed",
    allowedUserId: "",
    notifyOnComplete: false,
    ...extra,
  };
}

function baseCredentials() {
  return { appId: "cli_a123456789", appSecret: "secret-value-123456" };
}

test("requestApproval sends a Feishu card and resolves allow from a matching callback", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_1" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "n123",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  assert.equal(runner.isEnabled(), true);

  const decisionPromise = runner.requestApproval({
    title: "codex requests Bash",
    detail: "Summary: Run tests",
  });
  await tick();

  const sendCall = channel.calls.find((call) => call.method === "send");
  assert.equal(sendCall.to, "oc_123");
  assert.equal(sendCall.input.card.schema, "2.0");

  channel.emitCardAction({
    messageId: "om_1",
    chatId: "oc_123",
    operator: { openId: "ou_allowed" },
    action: { value: "clawd:approval:n123:allow", tag: "button" },
  });

  assert.deepEqual(await decisionPromise, { action: "allow" });
  assert.equal(channel.calls.some((call) => call.method === "updateCard"), true);

  await runner.stop();
});

test("requestApproval resolves deny from a matching callback", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_2" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig({ allowedUserId: "u_allowed" }),
    getCredentials: baseCredentials,
    randomId: () => "n456",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  const decisionPromise = runner.requestApproval({
    title: "claude-code requests Edit",
    detail: "Summary: Update a file",
  });
  await tick();

  channel.emitCardAction({
    messageId: "om_2",
    chatId: "oc_123",
    operator: { openId: "ou_allowed", userId: "u_allowed" },
    action: { value: "clawd:approval:n456:deny", tag: "button" },
  });

  assert.deepEqual(await decisionPromise, { action: "deny" });
  await runner.stop();
});

test("requestApproval supports an open_id receive target with user_id approver validation", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_open" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig({
      receiveIdType: "open_id",
      receiveId: "ou_target",
      allowedOpenId: "",
      allowedUserId: "u_allowed",
    }),
    getCredentials: baseCredentials,
    randomId: () => "nopen",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  const decisionPromise = runner.requestApproval({
    title: "codex requests Bash",
    detail: "Summary: Run tests",
  });
  await tick();

  const sendCall = channel.calls.find((call) => call.method === "send");
  assert.equal(sendCall.to, "ou_target");
  assert.equal(sendCall.opts.idType, "open_id");

  channel.emitCardAction({
    messageId: "om_open",
    chatId: "oc_123",
    operator: { openId: "ou_someone", userId: "u_allowed" },
    action: { value: "clawd:approval:nopen:allow", tag: "button" },
  });

  assert.deepEqual(await decisionPromise, { action: "allow" });
  await runner.stop();
});

test("requestApproval accepts a card action when any configured approver id matches", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_any" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig({
      allowedOpenId: "ou_allowed",
      allowedUserId: "u_allowed",
    }),
    getCredentials: baseCredentials,
    randomId: () => "nany",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  const decisionPromise = runner.requestApproval({
    title: "codex requests Bash",
    detail: "Summary: Run tests",
  });
  await tick();

  channel.emitCardAction({
    messageId: "om_any",
    chatId: "oc_123",
    operator: { openId: "ou_allowed" },
    action: { value: { type: "clawd.approval", nonce: "nany", action: "allow" }, tag: "button" },
  });

  assert.deepEqual(await decisionPromise, { action: "allow" });
  await runner.stop();
});

test("requestApproval sends to all configured recipients and accepts any configured approver", async () => {
  const channel = createFakeFeishuChannel({
    sendResults: [{ messageId: "om_chat" }, { messageId: "om_open" }],
  });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig({
      receiveId: "",
      allowedOpenId: "",
      recipients: [
        {
          receiveIdType: "chat_id",
          receiveId: "oc_team",
          allowedOpenId: "ou_team_approver",
          allowedUserId: "",
        },
        {
          receiveIdType: "open_id",
          receiveId: "ou_direct_target",
          allowedOpenId: "",
          allowedUserId: "u_direct_approver",
        },
      ],
    }),
    getCredentials: baseCredentials,
    randomId: () => "nmulti",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  const decisionPromise = runner.requestApproval({
    title: "codex requests Bash",
    detail: "Summary: Run tests",
  });
  await tick();

  const sendCalls = channel.calls.filter((call) => call.method === "send");
  assert.deepEqual(sendCalls.map((call) => [call.to, call.opts.idType]), [
    ["oc_team", "chat_id"],
    ["ou_direct_target", "open_id"],
  ]);

  channel.emitCardAction({
    messageId: "om_chat",
    chatId: "oc_team",
    operator: { openId: "ou_intruder", userId: "u_intruder" },
    action: { value: "clawd:approval:nmulti:allow", tag: "button" },
  });
  await tick();
  assert.equal(runner.getStatus().pendingApprovalCount, 1);

  channel.emitCardAction({
    messageId: "om_open",
    chatId: "oc_team",
    operator: { openId: "ou_other", userId: "u_direct_approver" },
    action: { value: "clawd:approval:nmulti:deny", tag: "button" },
  });

  assert.deepEqual(await decisionPromise, { action: "deny" });
  assert.equal(channel.calls.filter((call) => call.method === "updateCard").length, 2);
  await runner.stop();
});

test("requestApproval returns rich suggestion decisions only for rendered suggestion indexes", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_rich" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "nrich",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  const decisionPromise = runner.requestApproval({
    title: "claude-code requests Bash",
    detail: "Summary: Run tests",
    suggestions: [
      { index: 0, label: "Always Bash" },
      { index: 2, label: "Auto edits" },
    ],
  });
  await tick();

  const sendCall = channel.calls.find((call) => call.method === "send");
  assert.match(JSON.stringify(sendCall.input.card), /Always Bash/);
  assert.match(JSON.stringify(sendCall.input.card), /Auto edits/);

  channel.emitCardAction({
    messageId: "om_rich",
    chatId: "oc_123",
    operator: { openId: "ou_allowed" },
    action: {
      value: { type: "clawd.approval", nonce: "nrich", action: "suggestion", index: 9 },
      tag: "button",
    },
  });
  await tick();
  assert.equal(runner.getStatus().pendingApprovalCount, 1);

  channel.emitCardAction({
    messageId: "om_rich",
    chatId: "oc_123",
    operator: { openId: "ou_allowed" },
    action: {
      value: { type: "clawd.approval", nonce: "nrich", action: "suggestion", index: 2 },
      tag: "button",
    },
  });

  assert.deepEqual(await decisionPromise, { action: "suggestion", index: 2 });
  await runner.stop();
});

test("requestApproval ignores unauthorized callbacks until an allowed user clicks", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_3" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "n789",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  const decisionPromise = runner.requestApproval({
    title: "codex requests Bash",
    detail: "Summary: Run tests",
  });
  let settled = false;
  decisionPromise.then(() => { settled = true; });
  await tick();

  channel.emitCardAction({
    messageId: "om_3",
    chatId: "oc_123",
    operator: { openId: "ou_wrong" },
    action: { value: "clawd:approval:n789:allow", tag: "button" },
  });
  await tick();
  assert.equal(settled, false);

  channel.emitCardAction({
    messageId: "om_3",
    chatId: "oc_123",
    operator: { openId: "ou_allowed" },
    action: { value: "clawd:approval:n789:deny", tag: "button" },
  });

  assert.deepEqual(await decisionPromise, { action: "deny" });
  await runner.stop();
});

test("requestApproval no longer self-times-out — persists until a card action or abort (v3.2)", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_persist" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "npersist",
    approvalTimeoutMs: 5, // legacy knob — must now be IGNORED (no self-timeout)
  });
  await runner.start();
  let resolved = false;
  const decisionPromise = runner.requestApproval({ title: "x", detail: "y" }).then((d) => { resolved = true; return d; });
  await delay(30);
  assert.equal(resolved, false, "approval must stay pending without a card action or abort");
  assert.equal(runner.getStatus().pendingApprovalCount, 1);
  // a real card action still resolves it
  channel.emitCardAction({
    messageId: "om_persist",
    chatId: "oc_123",
    operator: { openId: "ou_allowed" },
    action: { value: "clawd:approval:npersist:allow", tag: "button" },
  });
  assert.deepEqual(await decisionPromise, { action: "allow" });
  await runner.stop();
});

test("requestElicitation resolves an answer from an option button click", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_q" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "nq001",
    approvalTimeoutMs: 1000,
  });
  await runner.start();
  const decisionPromise = runner.requestElicitation({
    questions: [{ question: "Pick a color", options: ["Red", "Green", "Blue"] }],
  });
  await tick();

  const sendCall = channel.calls.find((call) => call.method === "send");
  assert.equal(sendCall.input.card.schema, "2.0");

  channel.emitCardAction({
    messageId: "om_q",
    chatId: "oc_123",
    operator: { openId: "ou_allowed" },
    action: { value: { type: "clawd.elicit", nonce: "nq001", questionIndex: 0, optionIndex: 2 } },
  });

  assert.deepEqual(await decisionPromise, { action: "answer", answers: { "Pick a color": "Blue" } });
  assert.equal(channel.calls.some((call) => call.method === "updateCard"), true);
  await runner.stop();
});

test("requestElicitation resolves a free-text reply as the custom (Other) answer", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_q2" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "nq002",
    approvalTimeoutMs: 1000,
  });
  await runner.start();
  const decisionPromise = runner.requestElicitation({
    questions: [{ question: "Your name?", options: ["Anonymous"] }],
  });
  await tick();

  channel.emitMessage({
    messageId: "im_1",
    chatId: "oc_123",
    openId: "ou_allowed",
    content: { text: "Ada Lovelace" },
  });

  assert.deepEqual(await decisionPromise, { action: "answer", answers: { "Your name?": "Ada Lovelace" } });
  await runner.stop();
});

test("requestElicitation ignores option clicks from unauthorized approvers", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_q3" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "nq003",
  });
  await runner.start();
  const decisionPromise = runner.requestElicitation({
    questions: [{ question: "Q", options: ["A"] }],
  });
  await tick();

  // v3.2: questions never self-timeout, so an unauthorized click must simply be
  // ignored — the request stays pending rather than resolving to null.
  channel.emitCardAction({
    messageId: "om_q3",
    chatId: "oc_123",
    operator: { openId: "ou_intruder" },
    action: { value: { type: "clawd.elicit", nonce: "nq003", questionIndex: 0, optionIndex: 0 } },
  });
  await tick();
  assert.equal(runner.getStatus().pendingElicitationCount, 1, "unauthorized click must not resolve the question");

  // An authorized click still resolves it.
  channel.emitCardAction({
    messageId: "om_q3",
    chatId: "oc_123",
    operator: { openId: "ou_allowed" },
    action: { value: { type: "clawd.elicit", nonce: "nq003", questionIndex: 0, optionIndex: 0 } },
  });
  assert.deepEqual(await decisionPromise, { action: "answer", answers: { Q: "A" } });
  await runner.stop();
});

test("aborting with a cause labels the resolved card (answered_elsewhere / superseded)", async () => {
  for (const [reason, pattern] of [
    ["answered_elsewhere", /desktop or terminal/i],
    ["superseded", /another channel/i],
  ]) {
    const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_cause" }] });
    const runner = createFeishuApprovalRunner({
      channelFactory: () => channel,
      getConfig: () => baseConfig(),
      getCredentials: baseCredentials,
      randomId: () => "ncause",
      approvalTimeoutMs: 1000,
    });
    await runner.start();
    const controller = new AbortController();
    const decisionPromise = runner.requestApproval({ title: "x", detail: "y" }, { signal: controller.signal });
    await tick();
    controller.abort(reason);
    assert.equal(await decisionPromise, null);
    const lastUpdate = channel.calls.filter((call) => call.method === "updateCard").pop();
    assert.ok(lastUpdate, `expected a resolved-card update for ${reason}`);
    assert.match(lastUpdate.card.body.elements[0].content, pattern);
    await runner.stop();
  }
});

test("requestApproval resolves null on abort and send failure", async () => {
  {
    const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_abort" }] });
    const runner = createFeishuApprovalRunner({
      channelFactory: () => channel,
      getConfig: () => baseConfig(),
      getCredentials: baseCredentials,
      randomId: () => "nabort",
      approvalTimeoutMs: 1000,
    });
    await runner.start();
    const controller = new AbortController();
    const decisionPromise = runner.requestApproval(
      { title: "x", detail: "y" },
      { signal: controller.signal },
    );
    await tick();
    controller.abort();
    assert.equal(await decisionPromise, null);
    assert.equal(runner.getStatus().pendingApprovalCount, 0);
    await runner.stop();
  }

  {
    const channel = createFakeFeishuChannel({ sendErrors: [new Error("send failed")] });
    const runner = createFeishuApprovalRunner({
      channelFactory: () => channel,
      getConfig: () => baseConfig(),
      getCredentials: baseCredentials,
      randomId: () => "nfail",
      approvalTimeoutMs: 1000,
    });
    await runner.start();
    const decision = await runner.requestApproval({ title: "x", detail: "y" });
    assert.equal(decision, null);
    assert.equal(runner.getStatus().pendingApprovalCount, 0);
    await runner.stop();
  }
});

test("stop clears pending approvals and disconnects the channel", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_stop" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "nstop",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  const decisionPromise = runner.requestApproval({ title: "x", detail: "y" });
  await tick();
  assert.equal(runner.getStatus().pendingApprovalCount, 1);

  await runner.stop();
  assert.equal(await decisionPromise, null);
  assert.equal(channel.disconnected, true);
  assert.equal(runner.getStatus().pendingApprovalCount, 0);
});

test("start skips without creating a channel when Feishu approval is disabled", async () => {
  let created = false;
  const runner = createFeishuApprovalRunner({
    channelFactory: () => {
      created = true;
      return createFakeFeishuChannel();
    },
    getConfig: () => baseConfig({ enabled: false }),
    getCredentials: baseCredentials,
  });

  const result = await runner.start();
  assert.deepEqual(result, { status: "skipped", reason: "disabled" });
  assert.equal(created, false);
  assert.equal(runner.isEnabled(), false);
});

test("sendTestCard waits for a Feishu card callback and returns the decision", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_test" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "ntest",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  const resultPromise = runner.sendTestCard();
  await tick();

  channel.emitCardAction({
    messageId: "om_test",
    chatId: "oc_123",
    operator: { openId: "ou_allowed" },
    action: { value: { type: "clawd.approval", nonce: "ntest", action: "allow" }, tag: "button" },
  });

  const result = await resultPromise;
  assert.equal(result.status, "ok");
  assert.equal(result.decision, "allow");
  assert.ok(Array.isArray(result.logs));
  assert.ok(result.logs.some((entry) => /completed/i.test(entry.message)));
  await runner.stop();
});

test("sendTestCard returns diagnostic logs for sent cards and ignored approvers", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_test" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig({
      allowedOpenId: "ou_allowed",
      allowedUserId: "u_allowed",
    }),
    getCredentials: baseCredentials,
    randomId: () => "ntestlog",
    testCardTimeoutMs: 5,
  });

  await runner.start();
  const resultPromise = runner.sendTestCard();
  await tick();

  channel.emitCardAction({
    messageId: "om_test",
    chatId: "oc_123",
    operator: { openId: "ou_wrong" },
    action: { value: { type: "clawd.approval", nonce: "ntestlog", action: "allow" }, tag: "button" },
  });

  const result = await resultPromise;
  assert.equal(result.status, "timeout");
  assert.ok(Array.isArray(result.logs));
  assert.ok(result.logs.some((entry) => /card sent/i.test(entry.message)));
  assert.ok(result.logs.some((entry) => /approver/i.test(entry.message)));
  assert.ok(result.logs.some((entry) => /timed out/i.test(entry.message)));
});

test("sendTestCard reports send failures distinctly from timeouts", async () => {
  const channel = createFakeFeishuChannel({ sendErrors: [new Error("invalid receive id")] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig(),
    getCredentials: baseCredentials,
    randomId: () => "ntestfail",
    approvalTimeoutMs: 1000,
  });

  await runner.start();
  const result = await runner.sendTestCard();
  assert.equal(result.status, "error");
  assert.equal(result.message, "invalid receive id");
  assert.ok(Array.isArray(result.logs));
  assert.ok(result.logs.some((entry) => /send failed/i.test(entry.message)));
  await runner.stop();
});

test("sendNotification is default-off and sends a plain Feishu message only when enabled", async () => {
  {
    const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_skip" }] });
    const runner = createFeishuApprovalRunner({
      channelFactory: () => channel,
      getConfig: () => baseConfig({ notifyOnComplete: false, completionOutputMode: "off" }),
      getCredentials: baseCredentials,
    });
    await runner.start();
    const result = await runner.sendNotification("done");

    assert.deepEqual(result, { ok: false, errorClass: "disabled" });
    assert.equal(channel.calls.filter((call) => call.method === "send").length, 0);
    await runner.stop();
  }

  {
    const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_done" }] });
    const runner = createFeishuApprovalRunner({
      channelFactory: () => channel,
      getConfig: () => baseConfig({ notifyOnComplete: true, completionOutputMode: "full" }),
      getCredentials: baseCredentials,
    });
    await runner.start();
    const result = await runner.sendNotification("done: task X");

    assert.deepEqual(result, { ok: true, messageId: "om_done" });
    const sendCall = channel.calls.find((call) => call.method === "send");
    assert.equal(sendCall.to, "oc_123");
    assert.deepEqual(sendCall.input, { text: "done: task X" });
    assert.equal(sendCall.opts.idType, "chat_id");
    await runner.stop();
  }

  {
    const channel = createFakeFeishuChannel({
      sendResults: [{ messageId: "om_done_1" }, { messageId: "om_done_2" }],
    });
    const runner = createFeishuApprovalRunner({
      channelFactory: () => channel,
      getConfig: () => baseConfig({
        notifyOnComplete: true,
        completionOutputMode: "full",
        receiveId: "",
        allowedOpenId: "",
        recipients: [
          {
            receiveIdType: "chat_id",
            receiveId: "oc_team",
            allowedOpenId: "ou_team_approver",
            allowedUserId: "",
          },
          {
            receiveIdType: "open_id",
            receiveId: "ou_direct_target",
            allowedOpenId: "",
            allowedUserId: "u_direct_approver",
          },
        ],
      }),
      getCredentials: baseCredentials,
    });
    await runner.start();
    const result = await runner.sendNotification("done: task X");

    assert.deepEqual(result, {
      ok: true,
      messageId: "om_done_1",
      messageIds: ["om_done_1", "om_done_2"],
    });
    assert.deepEqual(channel.calls.filter((call) => call.method === "send").map((call) => [call.to, call.opts.idType]), [
      ["oc_team", "chat_id"],
      ["ou_direct_target", "open_id"],
    ]);
    await runner.stop();
  }
});

test("sendNotification reports delivery failure without throwing", async () => {
  const channel = createFakeFeishuChannel({ sendErrors: [new Error("blocked")] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig({ notifyOnComplete: true, completionOutputMode: "full" }),
    getCredentials: baseCredentials,
  });

  await runner.start();
  const result = await runner.sendNotification("done");

  assert.equal(result.ok, false);
  assert.equal(result.errorClass, "send_failed");
  assert.match(result.message, /blocked/);
  await runner.stop();
});

test("authorized /status message sends a sanitized remote approval status reply", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_status" }] });
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig({ statusCommandEnabled: true }),
    getCredentials: baseCredentials,
    getStatusSummary: () => ({
      pendingApprovalCount: 2,
      doNotDisturb: true,
      providers: [
        {
          id: "feishu",
          label: "Feishu",
          configured: true,
          enabled: true,
          status: "running",
          lastErrorMessage: "send failed for chat_id=oc_secret_room app_secret=secret-value",
        },
        {
          id: "telegram",
          label: "Telegram",
          configured: true,
          enabled: false,
          status: "stopped",
        },
      ],
    }),
  });

  await runner.start();
  channel.emitMessage({
    messageId: "om_cmd",
    chatId: "oc_status_room",
    senderId: "ou_allowed",
    content: "/status",
  });
  await tick();

  const statusSend = channel.calls.find((call) =>
    call.method === "send" && call.to === "oc_status_room"
  );
  assert.ok(statusSend);
  assert.match(statusSend.input.text, /Clawd remote approval status/);
  assert.match(statusSend.input.text, /DND: on/);
  assert.match(statusSend.input.text, /Pending approvals: 2/);
  assert.match(statusSend.input.text, /Feishu: running/);
  assert.match(statusSend.input.text, /Telegram: stopped/);
  assert.doesNotMatch(statusSend.input.text, /oc_secret_room/);
  assert.doesNotMatch(statusSend.input.text, /secret-value/);
  assert.equal(statusSend.opts.idType, "chat_id");
  assert.equal(statusSend.opts.replyTo, "om_cmd");
  await runner.stop();
});

test("status command ignores unauthorized senders and can be disabled", async () => {
  {
    const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_status" }] });
    const runner = createFeishuApprovalRunner({
      channelFactory: () => channel,
      getConfig: () => baseConfig({ statusCommandEnabled: true }),
      getCredentials: baseCredentials,
      getStatusSummary: () => ({ pendingApprovalCount: 0, providers: [] }),
    });

    await runner.start();
    channel.emitMessage({
      messageId: "om_wrong",
      chatId: "oc_status_room",
      senderId: "ou_wrong",
      content: "/status",
    });
    await tick();

    assert.equal(channel.calls.some((call) => call.method === "send"), false);
    await runner.stop();
  }

  {
    const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_status" }] });
    const runner = createFeishuApprovalRunner({
      channelFactory: () => channel,
      getConfig: () => baseConfig({ statusCommandEnabled: false }),
      getCredentials: baseCredentials,
      getStatusSummary: () => ({ pendingApprovalCount: 0, providers: [] }),
    });

    await runner.start();
    channel.emitMessage({
      messageId: "om_disabled",
      chatId: "oc_status_room",
      senderId: "ou_allowed",
      content: "/status",
    });
    await tick();

    assert.equal(channel.calls.some((call) => call.method === "send"), false);
    await runner.stop();
  }
});

test("status card command sends a refreshable card and refresh updates the card", async () => {
  const channel = createFakeFeishuChannel({ sendResults: [{ messageId: "om_status_card" }] });
  let pendingCount = 1;
  const runner = createFeishuApprovalRunner({
    channelFactory: () => channel,
    getConfig: () => baseConfig({ statusCommandEnabled: true }),
    getCredentials: baseCredentials,
    getStatusSummary: () => ({
      pendingApprovalCount: pendingCount,
      doNotDisturb: false,
      providers: [{
        id: "feishu",
        label: "Feishu",
        configured: true,
        enabled: true,
        status: "running",
      }],
    }),
  });

  await runner.start();
  channel.emitMessage({
    messageId: "om_cmd_card",
    chatId: "oc_status_room",
    senderId: "ou_allowed",
    content: "/status card",
  });
  await tick();

  const cardSend = channel.calls.find((call) =>
    call.method === "send" && call.input.card
  );
  assert.ok(cardSend);
  assert.match(JSON.stringify(cardSend.input.card), /Refresh status/);
  assert.match(JSON.stringify(cardSend.input.card), /Pending approvals: 1/);

  pendingCount = 0;
  channel.emitCardAction({
    messageId: "om_status_card",
    chatId: "oc_status_room",
    operator: { openId: "ou_wrong" },
    action: {
      value: { type: "clawd.status", action: "refresh" },
      tag: "button",
    },
  });
  await tick();
  assert.equal(channel.calls.filter((call) => call.method === "updateCard").length, 0);

  channel.emitCardAction({
    messageId: "om_status_card",
    chatId: "oc_status_room",
    operator: { openId: "ou_allowed" },
    action: {
      value: { type: "clawd.status", action: "refresh" },
      tag: "button",
    },
  });
  await tick();

  const update = channel.calls.find((call) =>
    call.method === "updateCard" && call.messageId === "om_status_card"
  );
  assert.ok(update);
  assert.match(JSON.stringify(update.card), /Pending approvals: 0/);
  await runner.stop();
});

test("createSdkChannel builds the SDK WebSocket channel without connecting it", () => {
  const calls = [];
  const fakeSdk = {
    Domain: { Feishu: "feishu-domain", Lark: "lark-domain" },
    LoggerLevel: { fatal: 0, warn: 2 },
    createLarkChannel(options) {
      calls.push(options);
      return { channel: true };
    },
  };

  const channel = createSdkChannel({
    sdk: fakeSdk,
    config: baseConfig({ region: "lark" }),
    credentials: baseCredentials(),
  });

  assert.deepEqual(channel, { channel: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].appId, "cli_a123456789");
  assert.equal(calls[0].appSecret, "secret-value-123456");
  assert.equal(calls[0].domain, "lark-domain");
  assert.equal(calls[0].transport, "websocket");
  assert.equal(calls[0].loggerLevel, 0);
  assert.equal(typeof calls[0].logger.error, "function");
  assert.equal(typeof calls[0].logger.warn, "function");
  assert.equal(domainForRegion(fakeSdk, "feishu"), "feishu-domain");
});
