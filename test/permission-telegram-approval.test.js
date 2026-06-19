"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const PERMISSION_MODULE_PATH = require.resolve("../src/permission");

function loadPermissionWithElectronMock() {
  delete require.cache[PERMISSION_MODULE_PATH];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return {
        BrowserWindow: Object.assign(class {}, { fromWebContents() { return null; } }),
        globalShortcut: {
          register() { return true; },
          unregister() {},
          isRegistered() { return false; },
        },
      };
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    return require("../src/permission");
  } finally {
    Module._load = originalLoad;
  }
}

const initPermission = loadPermissionWithElectronMock();

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

function createMockResponse() {
  const captured = {
    statusCode: null,
    headers: {},
    body: "",
    ended: false,
    destroyCalls: 0,
    listeners: {},
  };
  return {
    captured,
    writableEnded: false,
    destroyed: false,
    headersSent: false,
    writeHead(status, headers) {
      captured.statusCode = status;
      if (headers) Object.assign(captured.headers, headers);
      this.headersSent = true;
    },
    end(chunk) {
      if (chunk !== undefined) captured.body += String(chunk);
      captured.ended = true;
      this.writableEnded = true;
    },
    destroy() {
      captured.destroyCalls += 1;
      this.destroyed = true;
    },
    on(evt, fn) {
      (captured.listeners[evt] = captured.listeners[evt] || []).push(fn);
    },
    removeListener(evt, fn) {
      const listeners = captured.listeners[evt] || [];
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    },
  };
}

function makeCtx(overrides = {}) {
  return {
    focusTerminalForSession: () => {},
    getSettingsSnapshot: () => ({}),
    isAgentPermissionsEnabled: () => true,
    getBubblePolicy: () => ({ enabled: true, autoCloseMs: 0 }),
    getPetWindowBounds: () => null,
    getNearestWorkArea: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    getHitRectScreen: () => null,
    getHudReservedOffset: () => 0,
    guardAlwaysOnTop: () => {},
    reapplyMacVisibility: () => {},
    permDebugLog: null,
    repositionUpdateBubble: () => {},
    win: null,
    bubbleFollowPet: false,
    petHidden: false,
    doNotDisturb: false,
    hideBubbles: false,
    sessions: new Map([["sid", { cwd: "D:\\work\\project-alpha" }]]),
    subscribeShortcuts: () => {},
    reportShortcutFailure: () => {},
    clearShortcutFailure: () => {},
    ...overrides,
  };
}

function makePermEntry(overrides = {}) {
  return {
    res: createMockResponse(),
    abortHandler: () => {},
    suggestions: [],
    sessionId: "sid",
    bubble: null,
    hideTimer: null,
    toolName: "Bash",
    // Default fixture carries a description so behaviour tests can exercise
    // the remote-approval lifecycle. Cases that want to prove the no-summary
    // guard explicitly clear toolInput.description.
    toolInput: {
      command: "npm test -- --token sk-1234567890123456",
      description: "Run project tests",
    },
    resolvedSuggestion: null,
    createdAt: Date.now() - 5000,
    agentId: "claude-code",
    ...overrides,
  };
}

describe("permission telegram remote approval", () => {
  it("sends a conservative payload and resolves allow without a message", async () => {
    let resolveApproval;
    const requests = [];
    const resolved = [];
    const client = {
      isEnabled: () => true,
      requestApproval: (payload, options) => {
        requests.push({ payload, options });
        return new Promise((resolve) => { resolveApproval = resolve; });
      },
    };
    const perm = initPermission(makeCtx({
      getTelegramApprovalClient: () => client,
      onPermissionResolved: (entry, meta) => resolved.push({ entry, meta }),
    }));
    const entry = makePermEntry({
      toolInput: {
        command: "npm test -- --token sk-1234567890123456",
        description: "Run project tests for chat 987654321 and telegram:123456789",
      },
    });
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    assert.equal(requests.length, 1);
    assert.match(requests[0].payload.title, /claude-code requests Bash/);
    assert.match(requests[0].payload.detail, /Agent: claude-code/);
    assert.match(requests[0].payload.detail, /Tool: Bash/);
    assert.match(requests[0].payload.detail, /Folder: project-alpha/);
    assert.match(requests[0].payload.detail, /Summary: Run project tests/);
    assert.equal(requests[0].payload.detail.includes("npm test"), false);
    assert.equal(requests[0].payload.detail.includes("sk-1234567890123456"), false);
    assert.equal(requests[0].payload.detail.includes("987654321"), false);
    assert.equal(requests[0].payload.detail.includes("telegram:123456789"), false);

    resolveApproval("allow");
    await flush();
    await flush();

    assert.equal(perm.pendingPermissions.length, 0);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].entry, entry);
    assert.deepEqual(resolved[0].meta, {
      reason: "resolved",
      hasPendingForSession: false,
    });
    const body = JSON.parse(entry.res.captured.body);
    assert.deepEqual(body.hookSpecificOutput.decision, { behavior: "allow" });
  });

  it("turns Telegram suggestion decisions into updatedPermissions for rich agents", async () => {
    let resolveApproval;
    const requests = [];
    const client = {
      isEnabled: () => true,
      requestApproval: (payload, options) => {
        requests.push({ payload, options });
        return new Promise((resolve) => { resolveApproval = resolve; });
      },
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const suggestion = {
      type: "addRules",
      destination: "localSettings",
      behavior: "allow",
      rules: [{ toolName: "Bash", ruleContent: "npm test" }],
    };
    const entry = makePermEntry({
      suggestions: [
        suggestion,
        { type: "setMode", mode: "acceptEdits", destination: "localSettings" },
      ],
    });
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    assert.deepEqual(requests[0].payload.suggestions, [
      { index: 0, label: "Always Bash" },
      { index: 1, label: "Auto edits" },
    ]);

    resolveApproval({ action: "suggestion", index: 0 });
    await flush();
    await flush();

    assert.equal(perm.pendingPermissions.length, 0);
    const body = JSON.parse(entry.res.captured.body);
    assert.deepEqual(body.hookSpecificOutput.decision, {
      behavior: "allow",
      updatedPermissions: [suggestion],
    });
  });

  it("keeps legacy remote deny strings working", async () => {
    const client = {
      isEnabled: () => true,
      requestApproval: () => Promise.resolve("deny"),
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const entry = makePermEntry();
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    await flush();
    await flush();

    assert.equal(perm.pendingPermissions.length, 0);
    const body = JSON.parse(entry.res.captured.body);
    assert.deepEqual(body.hookSpecificOutput.decision, { behavior: "deny" });
  });

  it("leaves the local permission pending on remote timeout or errors", async () => {
    const client = {
      isEnabled: () => true,
      requestApproval: () => Promise.resolve(null),
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const entry = makePermEntry();
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    await flush();
    await flush();

    assert.equal(perm.pendingPermissions.length, 1);
    assert.equal(entry.res.captured.ended, false);
  });

  it("uses generic remote clients and lets the first Telegram or Feishu decision win", async () => {
    const telegramDecision = deferred();
    const feishuDecision = deferred();
    const calls = [];
    const telegram = {
      id: "telegram",
      isEnabled: () => true,
      requestApproval: (_payload, options) => {
        calls.push({ id: "telegram", signal: options.signal });
        return telegramDecision.promise;
      },
    };
    const feishu = {
      id: "feishu",
      isEnabled: () => true,
      requestApproval: (_payload, options) => {
        calls.push({ id: "feishu", signal: options.signal });
        return feishuDecision.promise;
      },
    };
    const perm = initPermission(makeCtx({
      getRemoteApprovalClients: () => [telegram, feishu],
      getTelegramApprovalClient: () => {
        throw new Error("legacy Telegram fallback should not run");
      },
    }));
    const entry = makePermEntry();
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    assert.deepEqual(calls.map((call) => call.id), ["telegram", "feishu"]);

    feishuDecision.resolve({ action: "deny" });
    await flush();
    telegramDecision.resolve("allow");
    await flush();
    await flush();

    assert.equal(perm.pendingPermissions.length, 0);
    assert.equal(calls[0].signal.aborted, true);
    assert.equal(calls[1].signal.aborted, true);
    const body = JSON.parse(entry.res.captured.body);
    assert.deepEqual(body.hookSpecificOutput.decision, { behavior: "deny" });
  });

  it("does not expose or accept rich suggestions for unsupported agents", async () => {
    const requests = [];
    const client = {
      isEnabled: () => true,
      requestApproval: (payload) => {
        requests.push(payload);
        return Promise.resolve({ action: "suggestion", index: 0 });
      },
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const entry = makePermEntry({
      agentId: "codex",
      isCodex: true,
      suggestions: [{ type: "setMode", mode: "default", destination: "localSettings" }],
    });
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    assert.equal(Object.prototype.hasOwnProperty.call(requests[0], "suggestions"), false);
    await flush();
    await flush();

    assert.equal(perm.pendingPermissions.length, 1);
    assert.equal(entry.res.captured.ended, false);
  });

  it("ignores stale Telegram decisions after the local permission resolves first", async () => {
    let resolveApproval;
    const client = {
      isEnabled: () => true,
      requestApproval: () => new Promise((resolve) => { resolveApproval = resolve; }),
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const entry = makePermEntry({
      suggestions: [{ type: "setMode", mode: "acceptEdits", destination: "localSettings" }],
    });
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    perm.resolvePermissionEntry(entry, "deny");
    const bodyBeforeRemote = entry.res.captured.body;

    resolveApproval({ action: "suggestion", index: 0 });
    await flush();
    await flush();

    assert.equal(perm.pendingPermissions.length, 0);
    assert.equal(entry.res.captured.body, bodyBeforeRemote);
    assert.deepEqual(JSON.parse(entry.res.captured.body).hookSpecificOutput.decision, { behavior: "deny" });
  });

  it("ignores invalid Telegram suggestion indexes for rich agents without resolving locally", async () => {
    const client = {
      isEnabled: () => true,
      requestApproval: () => Promise.resolve({ action: "suggestion", index: 9 }),
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const entry = makePermEntry({
      agentId: "codebuddy",
      suggestions: [{ type: "setMode", mode: "acceptEdits", destination: "localSettings" }],
    });
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    await flush();
    await flush();

    assert.equal(perm.pendingPermissions.length, 1);
    assert.equal(entry.res.captured.ended, false);
    assert.equal(entry.resolvedSuggestion, null);
  });

  it("aborts the remote request when the local permission resolves first", async () => {
    let signal;
    const client = {
      isEnabled: () => true,
      requestApproval: (_payload, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const entry = makePermEntry();
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    assert.equal(signal.aborted, false);

    perm.resolvePermissionEntry(entry, "deny");

    assert.equal(signal.aborted, true);
    // v3: the remote card must be told it was resolved elsewhere (so it shows
    // "Resolved on desktop or terminal", not a misleading "Expired").
    assert.equal(signal.reason, "answered_elsewhere");
    assert.equal(perm.pendingPermissions.length, 0);
    const body = JSON.parse(entry.res.captured.body);
    assert.deepEqual(body.hookSpecificOutput.decision, { behavior: "deny" });
  });

  it("does not start remote approval for non-actionable entries", () => {
    const requests = [];
    const client = {
      isEnabled: () => true,
      requestApproval: (payload) => {
        requests.push(payload);
        return Promise.resolve("allow");
      },
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const entries = [
      makePermEntry({ isElicitation: true }),
      makePermEntry({ isCodexNotify: true }),
      makePermEntry({ isKimiNotify: true }),
      makePermEntry({ isOpencode: true }),
      makePermEntry({ isAntigravity: true, agentId: "antigravity-cli" }),
      makePermEntry({ isCopilotCli: true, agentId: "copilot-cli" }),
      makePermEntry({ toolName: "ExitPlanMode" }),
      makePermEntry({ toolName: "AskUserQuestion" }),
      makePermEntry({ toolName: "TaskList" }),
    ];

    for (const entry of entries) {
      assert.equal(perm.maybeStartRemoteApproval(entry), false, entry.toolName);
    }
    assert.deepEqual(requests, []);
  });

  it("does not send a Telegram card when the tool input lacks a description/summary/reason", () => {
    const requests = [];
    const client = {
      isEnabled: () => true,
      requestApproval: (payload) => {
        requests.push(payload);
        return Promise.resolve("allow");
      },
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    // Bare Bash payload — only `command`. Local bubble shows the full command
    // but Telegram would only get "Tool input hidden by Clawd.", so the guard
    // must refuse to send.
    const entry = makePermEntry({
      toolInput: { command: "rm -rf /tmp/scratch" },
    });
    assert.equal(perm.maybeStartRemoteApproval(entry), false);
    assert.deepEqual(requests, []);
  });

  it("does not send a Telegram card for headless sessions", () => {
    const requests = [];
    const client = {
      isEnabled: () => true,
      requestApproval: (payload) => {
        requests.push(payload);
        return Promise.resolve("allow");
      },
    };
    const ctx = makeCtx({
      getTelegramApprovalClient: () => client,
      sessions: new Map([["sid", { cwd: "D:\\work\\project-alpha", headless: true }]]),
    });
    const perm = initPermission(ctx);
    const entry = makePermEntry();
    assert.equal(perm.maybeStartRemoteApproval(entry), false);
    assert.deepEqual(requests, []);
  });

  it("aborts the remote request when the user picks deny-and-focus (go to terminal)", () => {
    let signal;
    const client = {
      isEnabled: () => true,
      requestApproval: (_payload, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const entry = makePermEntry();
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    assert.equal(signal.aborted, false);

    // deny-and-focus removes the entry from pendingPermissions without writing
    // an HTTP response — historically it left the remote prompt to TTL out.
    perm.dismissPermissionForTerminal(entry);

    assert.equal(signal.aborted, true);
    assert.equal(signal.reason, "answered_elsewhere");
    assert.equal(perm.pendingPermissions.indexOf(entry), -1);
  });

  // v3.2-P2B: phantom-card guard. An approval that was auto-approved / already
  // resolved is removed from pendingPermissions before the route calls
  // maybeStartRemoteApproval, so no remote card must fire for a closed request.
  // This is the root cause of the old "I hadn't clicked yet and it auto-resolved
  // / went Expired" phantom.
  it("does not start remote approval for an already-resolved entry (no phantom card)", () => {
    const requests = [];
    const client = {
      isEnabled: () => true,
      requestApproval: (payload) => { requests.push(payload); return new Promise(() => {}); },
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    const entry = makePermEntry();
    // Intentionally NOT pushed to pendingPermissions — mirrors an entry that
    // auto-pilot already resolved inside showPermissionBubble.
    assert.equal(perm.pendingPermissions.indexOf(entry), -1);
    assert.equal(perm.maybeStartRemoteApproval(entry), false);
    assert.deepEqual(requests, []);
  });

  // v3.2-P2B: there is no agent allowlist on the plain allow/deny card — every
  // agent that uses the standard held-connection approval transport reaches the
  // remote provider. (Rich SUGGESTION buttons are gated separately by
  // isRemoteRichApprovalSupported; the approval card itself is not.)
  it("starts remote approval for any standard agent's genuine approval", () => {
    const client = {
      isEnabled: () => true,
      requestApproval: () => new Promise(() => {}),
    };
    const perm = initPermission(makeCtx({ getTelegramApprovalClient: () => client }));
    for (const agentId of ["claude-code", "codex", "qwen-code", "some-future-agent"]) {
      const entry = makePermEntry({ agentId });
      perm.pendingPermissions.push(entry);
      assert.equal(perm.maybeStartRemoteApproval(entry), true, agentId);
    }
  });
});

describe("permission feishu remote elicitation (v3)", () => {
  function makeElicitEntry(overrides = {}) {
    return makePermEntry({
      isElicitation: true,
      toolName: "AskUserQuestion",
      toolInput: { questions: [{ question: "Pick a color", options: ["Red", "Blue"] }] },
      ...overrides,
    });
  }

  it("answers AskUserQuestion via a remote elicitation client and resolves with the answer", async () => {
    let resolveElicit;
    const requests = [];
    const client = {
      id: "feishu",
      isEnabled: () => true,
      requestElicitation: (payload, options) => {
        requests.push({ payload, options });
        return new Promise((resolve) => { resolveElicit = resolve; });
      },
    };
    const perm = initPermission(makeCtx({ getRemoteElicitationClients: () => [client] }));
    const entry = makeElicitEntry();
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteElicitation(entry), true);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].payload.questions, [{ question: "Pick a color", options: ["Red", "Blue"] }]);
    assert.equal(requests[0].options.signal.aborted, false);

    resolveElicit({ action: "answer", answers: { "Pick a color": "Blue" } });
    await flush();
    await flush();

    assert.equal(perm.pendingPermissions.indexOf(entry), -1);
    assert.deepEqual(entry.resolvedUpdatedInput.answers, { "Pick a color": "Blue" });
  });

  it("does not start remote elicitation for non-elicitation / non-AskUserQuestion / empty-question entries", () => {
    const requests = [];
    const client = {
      id: "feishu",
      isEnabled: () => true,
      requestElicitation: (payload) => { requests.push(payload); return new Promise(() => {}); },
    };
    const perm = initPermission(makeCtx({ getRemoteElicitationClients: () => [client] }));
    const entries = [
      makeElicitEntry({ isElicitation: false }),
      makeElicitEntry({ toolName: "Bash" }),
      makeElicitEntry({ toolInput: { questions: [] } }),
    ];
    for (const entry of entries) {
      perm.pendingPermissions.push(entry);
      assert.equal(perm.maybeStartRemoteElicitation(entry), false);
    }
    assert.deepEqual(requests, []);
  });

  it("aborts the remote elicitation with 'answered_elsewhere' when resolved locally first", () => {
    let signal;
    const client = {
      id: "feishu",
      isEnabled: () => true,
      requestElicitation: (_payload, options) => { signal = options.signal; return new Promise(() => {}); },
    };
    const perm = initPermission(makeCtx({ getRemoteElicitationClients: () => [client] }));
    const entry = makeElicitEntry();
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteElicitation(entry), true);
    assert.equal(signal.aborted, false);

    perm.resolvePermissionEntry(entry, "allow");

    assert.equal(signal.aborted, true);
    assert.equal(signal.reason, "answered_elsewhere");
  });
});
