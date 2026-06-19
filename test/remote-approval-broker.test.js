"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  startRemoteApprovalFanout,
} = require("../src/remote-approval/broker");

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeClient(id, approval) {
  const calls = [];
  return {
    id,
    calls,
    isEnabled: () => true,
    requestApproval(payload, options) {
      calls.push({ payload, options });
      return typeof approval === "function" ? approval(payload, options) : approval;
    },
  };
}

function normalize(decision) {
  if (decision === "allow" || decision === "deny") return { action: decision };
  if (decision && typeof decision === "object" && (decision.action === "allow" || decision.action === "deny")) {
    return { action: decision.action };
  }
  return null;
}

test("startRemoteApprovalFanout sends the same payload to all enabled providers", () => {
  const payload = { title: "agent requests Bash", detail: "Summary: Run tests" };
  const telegram = makeClient("telegram", Promise.resolve(null));
  const feishu = makeClient("feishu", Promise.resolve(null));

  const handle = startRemoteApprovalFanout({
    clients: [telegram, feishu],
    payload,
    normalizeDecision: normalize,
    onDecision: () => {},
  });

  assert.equal(handle.started, true);
  assert.equal(telegram.calls.length, 1);
  assert.equal(feishu.calls.length, 1);
  assert.equal(telegram.calls[0].payload, payload);
  assert.equal(feishu.calls[0].payload, payload);
  assert.equal(telegram.calls[0].options.signal.aborted, false);
  assert.equal(feishu.calls[0].options.signal.aborted, false);
});

test("startRemoteApprovalFanout resolves only the first explicit decision", async () => {
  const first = deferred();
  const second = deferred();
  const decisions = [];
  const telegram = makeClient("telegram", first.promise);
  const feishu = makeClient("feishu", second.promise);

  const handle = startRemoteApprovalFanout({
    clients: [telegram, feishu],
    payload: { title: "x", detail: "y" },
    normalizeDecision: normalize,
    onDecision: (decision, meta) => decisions.push({ decision, meta }),
  });

  second.resolve({ action: "deny" });
  await flush();
  first.resolve("allow");
  await flush();
  await flush();

  assert.equal(handle.started, true);
  assert.deepEqual(decisions, [
    { decision: { action: "deny" }, meta: { providerId: "feishu" } },
  ]);
  assert.equal(telegram.calls[0].options.signal.aborted, true);
});

test("startRemoteApprovalFanout accepts rich suggestions only from capable providers", async () => {
  const logs = [];
  const decisions = [];
  const plain = makeClient("plain", Promise.resolve({ action: "suggestion", index: 0 }));
  const capable = {
    ...makeClient("capable", Promise.resolve({ action: "suggestion", index: 2 })),
    capabilities: { supportsRichApproval: true },
  };

  const handle = startRemoteApprovalFanout({
    clients: [plain, capable],
    payload: { title: "x", detail: "y", suggestions: [{ index: 0, label: "Always Bash" }] },
    normalizeDecision: (decision) => decision,
    onDecision: (decision, meta) => decisions.push({ decision, meta }),
    log: (message) => logs.push(message),
  });
  await flush();
  await flush();

  assert.equal(handle.started, true);
  assert.deepEqual(decisions, [
    { decision: { action: "suggestion", index: 2 }, meta: { providerId: "capable" } },
  ]);
  assert.equal(logs.some((entry) => entry.includes("plain") && entry.includes("rich")), true);
});

test("startRemoteApprovalFanout aborts all providers and ignores late decisions", async () => {
  const first = deferred();
  const second = deferred();
  const decisions = [];
  const telegram = makeClient("telegram", first.promise);
  const feishu = makeClient("feishu", second.promise);

  const handle = startRemoteApprovalFanout({
    clients: [telegram, feishu],
    payload: { title: "x", detail: "y" },
    normalizeDecision: normalize,
    onDecision: (decision) => decisions.push(decision),
  });

  handle.abort();
  first.resolve("allow");
  second.resolve("deny");
  await flush();
  await flush();

  assert.equal(telegram.calls[0].options.signal.aborted, true);
  assert.equal(feishu.calls[0].options.signal.aborted, true);
  assert.deepEqual(decisions, []);
});

test("startRemoteApprovalFanout skips disabled and malformed providers", () => {
  const enabled = makeClient("enabled", Promise.resolve(null));
  const disabled = {
    id: "disabled",
    isEnabled: () => false,
    requestApproval() {
      throw new Error("must not be called");
    },
  };

  const handle = startRemoteApprovalFanout({
    clients: [null, disabled, {}, enabled],
    payload: { title: "x", detail: "y" },
    normalizeDecision: normalize,
    onDecision: () => {},
  });

  assert.equal(handle.started, true);
  assert.equal(enabled.calls.length, 1);
  assert.equal(handle.providerCount, 1);
});

test("startRemoteApprovalFanout logs provider failures without auto-denying", async () => {
  const logs = [];
  const good = makeClient("good", Promise.resolve("allow"));
  const broken = makeClient("broken", () => {
    throw new Error("boom");
  });
  const decisions = [];

  const handle = startRemoteApprovalFanout({
    clients: [broken, good],
    payload: { title: "x", detail: "y" },
    normalizeDecision: normalize,
    onDecision: (decision) => decisions.push(decision),
    log: (message) => logs.push(message),
  });
  await flush();
  await flush();

  assert.equal(handle.started, true);
  assert.deepEqual(decisions, [{ action: "allow" }]);
  assert.equal(logs.some((entry) => entry.includes("broken")), true);
  assert.equal(logs.some((entry) => entry.includes("boom")), true);
});

// v3 SAFETY INVARIANT (regression lock): a provider that resolves null —
// which is exactly what the Feishu runner returns on timeout / abort / send
// failure — must NEVER settle the request. If this ever regresses, a Feishu
// timeout could let the local tool run without the user's remote decision.
// See docs/Expand_function/feishu/feishu-remote-approval-v3-development-plan.md §2.2.
test("a provider resolving null (Feishu timeout/abort) never settles the request", async () => {
  const decisions = [];
  const expiring = makeClient("feishu", Promise.resolve(null));

  const handle = startRemoteApprovalFanout({
    clients: [expiring],
    payload: { title: "x", detail: "y" },
    normalizeDecision: normalize,
    onDecision: (decision) => decisions.push(decision),
  });
  await flush();
  await flush();

  assert.equal(handle.started, true);
  assert.deepEqual(decisions, []);
});

test("a late null after another provider denies does not override the decision", async () => {
  const first = deferred();
  const second = deferred();
  const decisions = [];
  const denier = makeClient("telegram", first.promise);
  const expiring = makeClient("feishu", second.promise);

  startRemoteApprovalFanout({
    clients: [denier, expiring],
    payload: { title: "x", detail: "y" },
    normalizeDecision: normalize,
    onDecision: (decision, meta) => decisions.push({ decision, meta }),
  });

  first.resolve("deny");
  await flush();
  second.resolve(null);
  await flush();
  await flush();

  assert.deepEqual(decisions, [
    { decision: { action: "deny" }, meta: { providerId: "telegram" } },
  ]);
});

// v3: the resolved card needs to know WHY it was cancelled. When one provider
// decides, the others are aborted with a "superseded" reason; an externally
// driven abort (local desktop/terminal resolution) forwards its own reason.
test("settling a decision aborts other providers with a 'superseded' reason", async () => {
  const first = deferred();
  const second = deferred();
  const telegram = makeClient("telegram", first.promise);
  const feishu = makeClient("feishu", second.promise);

  startRemoteApprovalFanout({
    clients: [telegram, feishu],
    payload: { title: "x", detail: "y" },
    normalizeDecision: normalize,
    onDecision: () => {},
  });

  first.resolve("allow");
  await flush();
  await flush();

  assert.equal(feishu.calls[0].options.signal.aborted, true);
  assert.equal(feishu.calls[0].options.signal.reason, "superseded");
});

test("handle.abort forwards its reason to provider signals", () => {
  const pending = deferred();
  const feishu = makeClient("feishu", pending.promise);

  const handle = startRemoteApprovalFanout({
    clients: [feishu],
    payload: { title: "x", detail: "y" },
    normalizeDecision: normalize,
    onDecision: () => {},
  });

  handle.abort("answered_elsewhere");

  assert.equal(feishu.calls[0].options.signal.aborted, true);
  assert.equal(feishu.calls[0].options.signal.reason, "answered_elsewhere");
});

test("startRemoteApprovalFanout reports not started when no provider can run", () => {
  const handle = startRemoteApprovalFanout({
    clients: [],
    payload: { title: "x", detail: "y" },
    normalizeDecision: normalize,
    onDecision: () => {
      throw new Error("must not run");
    },
  });

  assert.equal(handle.started, false);
  assert.equal(handle.providerCount, 0);
  assert.doesNotThrow(() => handle.abort());
});

// v4 (Feishu all-tools coverage): providers can require an explicit,
// agent-supplied summary. Synthesized summaries (Clawd-built for tools without
// description/summary/reason) are withheld from such providers (Telegram) but
// still sent to lenient ones (Feishu). This is how "broaden Feishu only" is
// expressed without a provider branch in the shared path.
test("withholds synthesized summaries from providers that require an explicit one", () => {
  const strict = {
    ...makeClient("telegram", Promise.resolve(null)),
    capabilities: { requiresExplicitSummary: true },
  };
  const lenient = makeClient("feishu", Promise.resolve(null));

  const handle = startRemoteApprovalFanout({
    clients: [strict, lenient],
    payload: { title: "x", detail: "y", summarySource: "synthesized" },
    normalizeDecision: normalize,
    onDecision: () => {},
  });

  assert.equal(strict.calls.length, 0);   // Telegram withheld
  assert.equal(lenient.calls.length, 1);  // Feishu still sent
  assert.equal(handle.providerCount, 1);
  assert.equal(handle.started, true);
});

test("explicit summaries go to all providers including strict ones", () => {
  const strict = {
    ...makeClient("telegram", Promise.resolve(null)),
    capabilities: { requiresExplicitSummary: true },
  };
  const lenient = makeClient("feishu", Promise.resolve(null));

  startRemoteApprovalFanout({
    clients: [strict, lenient],
    payload: { title: "x", detail: "y", summarySource: "explicit" },
    normalizeDecision: normalize,
    onDecision: () => {},
  });

  assert.equal(strict.calls.length, 1);
  assert.equal(lenient.calls.length, 1);
});

test("a strict-only fanout with a synthesized summary reports not started", () => {
  const strict = {
    ...makeClient("telegram", Promise.resolve(null)),
    capabilities: { requiresExplicitSummary: true },
  };
  const handle = startRemoteApprovalFanout({
    clients: [strict],
    payload: { title: "x", detail: "y", summarySource: "synthesized" },
    normalizeDecision: normalize,
    onDecision: () => { throw new Error("must not run"); },
  });
  assert.equal(handle.started, false);
  assert.equal(handle.providerCount, 0);
});
