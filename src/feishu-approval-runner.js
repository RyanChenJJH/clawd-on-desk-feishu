"use strict";

const {
  buildFeishuApprovalCard,
  buildFeishuResolvedCard,
  buildFeishuStatusCard,
  buildFeishuQuestionCard,
  parseFeishuCardAction,
  parseFeishuElicitAction,
  parseFeishuStatusAction,
} = require("./feishu-card-builder");
const {
  getEffectiveFeishuRecipients,
  normalizeFeishuApproval,
} = require("./feishu-approval-settings");
const { formatRemoteApprovalStatusText } = require("./remote-approval/status");

// v3.2: real approval/elicitation cards have NO self-timeout — they persist
// until a user action or abort (matching the desktop Allow popup). Only the
// manual "send test card" diagnostic is bounded, so the Settings test doesn't
// spin forever; that bound is per-call via options.timeoutMs.
const DEFAULT_TEST_CARD_TIMEOUT_MS = 90000;
const NOTIFICATION_TEXT_MAX = 3600;
const SILENT_SDK_LOGGER = Object.freeze({
  error() {},
  warn() {},
  info() {},
  debug() {},
  trace() {},
});

function randomId() {
  return Math.random().toString(36).slice(2, 12);
}

function compactLogText(value, maxLen = 200) {
  let text = typeof value === "string" ? value : String(value == null ? "" : value);
  text = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > maxLen) text = `${text.slice(0, Math.max(0, maxLen - 3))}...`;
  return text;
}

function normalizeLogLevel(level) {
  return ["debug", "info", "warn", "error"].includes(level) ? level : "info";
}

// v3: map an AbortSignal's reason to a resolved-card status. Callers pass a
// string reason via controller.abort(reason): "superseded" (another provider
// decided) or "answered_elsewhere" (resolved on desktop/terminal). Any abort
// without a recognized reason still means "resolved outside Feishu", which is
// far more accurate than the old "Expired".
function abortCauseStatus(signal) {
  const reason = signal && typeof signal.reason === "string" ? signal.reason : "";
  if (reason === "superseded") return "superseded";
  return "answered_elsewhere";
}

function createTestLogCollector() {
  const logs = [];
  return {
    logs,
    add(level, message) {
      const text = compactLogText(message, 260);
      if (!text) return;
      logs.push({
        level: normalizeLogLevel(level),
        message: text,
      });
      if (logs.length > 60) logs.splice(0, logs.length - 60);
    },
  };
}

function trimString(value, maxLen = 512) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function normalizeCredentials(value) {
  const src = value && typeof value === "object" ? value : {};
  return {
    appId: trimString(src.appId || src.CLAWD_FEISHU_APP_ID, 128),
    appSecret: trimString(src.appSecret || src.CLAWD_FEISHU_APP_SECRET, 1024),
  };
}

function compactNotificationText(value) {
  return compactLogText(value, NOTIFICATION_TEXT_MAX);
}

function extractMessageId(result) {
  if (!result || typeof result !== "object") return "";
  return trimString(result.messageId || result.message_id || result.id || "", 128);
}

function normalizeSuggestionIndexes(suggestions) {
  if (!Array.isArray(suggestions)) return new Set();
  const indexes = new Set();
  for (const suggestion of suggestions) {
    if (!suggestion || typeof suggestion !== "object") continue;
    const index = Number(suggestion.index);
    if (Number.isInteger(index) && index >= 0 && trimString(suggestion.label, 80)) {
      indexes.add(index);
    }
  }
  return indexes;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstObject(...values) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return {};
}

function textFromMessageContent(value) {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return "";
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const parsed = JSON.parse(text);
        return firstString(parsed.text, parsed.content);
      } catch {}
    }
    return text;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return firstString(value.text, value.content);
  }
  return "";
}

function parseMessageCommand(text) {
  if (typeof text !== "string") return null;
  const match = text.trim().match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return {
    command: match[1].toLowerCase(),
    args: (match[2] || "").trim(),
  };
}

function parseFeishuMessage(event) {
  if (!event || typeof event !== "object") return null;
  const raw = firstObject(event.raw, event.event);
  const sender = firstObject(
    event.sender,
    event.operator,
    event.user,
    raw.sender,
    raw.operator,
    raw.user,
    raw.event && raw.event.sender,
  );
  const senderId = firstObject(
    sender.senderId,
    sender.sender_id,
    raw.sender_id,
    raw.event && raw.event.sender && raw.event.sender.sender_id,
  );
  const text = firstString(
    textFromMessageContent(event.content),
    textFromMessageContent(event.text),
    textFromMessageContent(event.message && event.message.content),
    textFromMessageContent(raw.content),
    textFromMessageContent(raw.event && raw.event.message && raw.event.message.content),
  );
  if (!text) return null;
  return {
    text,
    messageId: firstString(
      event.messageId,
      event.message_id,
      event.openMessageId,
      event.open_message_id,
      raw.message_id,
      raw.event && raw.event.message && raw.event.message.message_id,
    ),
    chatId: firstString(
      event.chatId,
      event.chat_id,
      event.openChatId,
      event.open_chat_id,
      raw.chat_id,
      raw.event && raw.event.message && raw.event.message.chat_id,
    ),
    openId: firstString(
      event.openId,
      event.open_id,
      event.senderId,
      sender.openId,
      sender.open_id,
      sender.openid,
      senderId.openId,
      senderId.open_id,
      senderId.openid,
    ),
    userId: firstString(
      event.userId,
      event.user_id,
      sender.userId,
      sender.user_id,
      senderId.userId,
      senderId.user_id,
    ),
  };
}

function domainForRegion(sdk, region) {
  const normalized = region === "lark" ? "lark" : "feishu";
  if (sdk && sdk.Domain) {
    if (normalized === "lark" && sdk.Domain.Lark) return sdk.Domain.Lark;
    if (normalized === "feishu" && sdk.Domain.Feishu) return sdk.Domain.Feishu;
  }
  return normalized === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
}

function createSdkChannel({ config, credentials, sdk, requireFn = require }) {
  const loadedSdk = sdk || requireFn("@larksuiteoapi/node-sdk");
  if (!loadedSdk || typeof loadedSdk.createLarkChannel !== "function") {
    throw new Error("Feishu SDK createLarkChannel export is missing");
  }
  return loadedSdk.createLarkChannel({
    appId: credentials.appId,
    appSecret: credentials.appSecret,
    domain: domainForRegion(loadedSdk, config.region),
    transport: "websocket",
    logger: SILENT_SDK_LOGGER,
    loggerLevel: loadedSdk.LoggerLevel && (loadedSdk.LoggerLevel.fatal ?? loadedSdk.LoggerLevel.error ?? loadedSdk.LoggerLevel.warn),
    policy: {
      dmMode: "open",
      requireMention: false,
    },
  });
}

function validateChannel(channel) {
  return !!channel
    && typeof channel.on === "function"
    && typeof channel.connect === "function"
    && typeof channel.disconnect === "function"
    && typeof channel.send === "function";
}

function readiness(config, credentials) {
  if (!config.enabled) return { ready: false, reason: "disabled" };
  if (!credentials.appId || !credentials.appSecret) return { ready: false, reason: "missing-credentials" };
  if (!config.receiveId && !config.recipients.some((entry) => entry.receiveId)) return { ready: false, reason: "missing-recipient" };
  if (
    !config.allowedOpenId
    && !config.allowedUserId
    && !config.recipients.some((entry) => entry.allowedOpenId || entry.allowedUserId)
  ) {
    return { ready: false, reason: "missing-approver" };
  }
  if (!getEffectiveFeishuRecipients(config).length) return { ready: false, reason: "missing-recipient" };
  return { ready: true };
}

function createFeishuApprovalRunner({
  channelFactory = null,
  getConfig = () => ({}),
  getCredentials = () => ({}),
  requireFn = require,
  sdk = null,
  log = () => {},
  // v3.2: only the "send test card" diagnostic is time-bounded. Real approvals
  // and elicitations never self-timeout (see DEFAULT_TEST_CARD_TIMEOUT_MS).
  testCardTimeoutMs = DEFAULT_TEST_CARD_TIMEOUT_MS,
  randomId: randomIdFn = randomId,
  getStatusSummary = null,
} = {}) {
  let channel = null;
  let started = false;
  let starting = null;
  let unsubscribeCardAction = null;
  let unsubscribeMessage = null;
  let unsubscribeError = null;
  let lastError = null;
  const pendingApprovals = new Map();
  // v3: AskUserQuestion answered in Feishu. Kept separate from pendingApprovals
  // so the allow/deny lifecycle is untouched. nonce -> elicitation entry.
  const pendingElicitations = new Map();

  function safeLog(level, message, meta) {
    try { log(level, message, meta); } catch {}
  }

  function currentConfig() {
    return normalizeFeishuApproval(getConfig());
  }


  function currentCredentials() {
    return normalizeCredentials(getCredentials());
  }

  function setLastError(scope, err) {
    lastError = {
      scope: compactLogText(scope, 48),
      message: compactLogText(err && err.message ? err.message : err, 160),
      at: Date.now(),
    };
  }

  function isEnabled() {
    const config = currentConfig();
    return started && !!channel && config.enabled === true && getEffectiveFeishuRecipients(config).length > 0;
  }

  function getStatus() {
    return {
      started,
      enabled: isEnabled(),
      pendingApprovalCount: pendingApprovals.size,
      pendingElicitationCount: pendingElicitations.size,
      lastError,
      connectionStatus: channel && typeof channel.getConnectionStatus === "function"
        ? channel.getConnectionStatus()
        : undefined,
    };
  }

  function createChannel(config, credentials) {
    if (typeof channelFactory === "function") {
      return channelFactory({ config, credentials });
    }
    return createSdkChannel({ config, credentials, sdk, requireFn });
  }

  function removeChannelHandlers() {
    if (typeof unsubscribeCardAction === "function") {
      try { unsubscribeCardAction(); } catch {}
    }
    if (typeof unsubscribeMessage === "function") {
      try { unsubscribeMessage(); } catch {}
    }
    if (typeof unsubscribeError === "function") {
      try { unsubscribeError(); } catch {}
    }
    unsubscribeCardAction = null;
    unsubscribeMessage = null;
    unsubscribeError = null;
  }

  async function start() {
    if (started) return { status: "ok" };
    if (starting) return starting;
    starting = (async () => {
      const config = currentConfig();
      const credentials = currentCredentials();
      const ready = readiness(config, credentials);
      if (!ready.ready) {
        lastError = { scope: "start", message: ready.reason, at: Date.now() };
        return { status: "skipped", reason: ready.reason };
      }
      try {
        channel = createChannel(config, credentials);
        if (!validateChannel(channel)) {
          throw new Error("Feishu approval channel is missing required methods");
        }
        const unsubscribe = channel.on("cardAction", handleCardAction);
        if (typeof unsubscribe === "function") unsubscribeCardAction = unsubscribe;
        const unsubscribeMsg = channel.on("message", handleMessage);
        if (typeof unsubscribeMsg === "function") unsubscribeMessage = unsubscribeMsg;
        if (typeof channel.on === "function") {
          const maybeErrorUnsub = channel.on("error", (err) => {
            setLastError("channel", err);
            safeLog("warn", "Feishu approval channel error", { error: err && err.message });
          });
          if (typeof maybeErrorUnsub === "function") unsubscribeError = maybeErrorUnsub;
        }
        await channel.connect();
        started = true;
        lastError = null;
        return { status: "ok" };
      } catch (err) {
        setLastError("start", err);
        safeLog("warn", "Feishu approval runner start failed", { error: err && err.message });
        removeChannelHandlers();
        channel = null;
        started = false;
        return { status: "error", message: err && err.message ? err.message : String(err) };
      } finally {
        starting = null;
      }
    })();
    return starting;
  }

  async function stop() {
    const oldChannel = channel;
    clearAllApprovals();
    clearAllElicitations();
    started = false;
    channel = null;
    removeChannelHandlers();
    if (oldChannel && typeof oldChannel.disconnect === "function") {
      try { await oldChannel.disconnect(); } catch {}
    }
  }

  function approverMatchesRecipient(parsed, recipient) {
    if (!parsed || !recipient) return false;
    const hasOpenIdRule = !!recipient.allowedOpenId;
    const hasUserIdRule = !!recipient.allowedUserId;
    if (!hasOpenIdRule && !hasUserIdRule) return false;
    return (hasOpenIdRule && parsed.openId === recipient.allowedOpenId)
      || (hasUserIdRule && parsed.userId === recipient.allowedUserId);
  }

  function isAllowedApprover(parsed, entry) {
    if (!parsed || !entry) return false;
    const recipients = Array.isArray(entry.recipients) && entry.recipients.length
      ? entry.recipients
      : getEffectiveFeishuRecipients(entry);
    return recipients.some((recipient) => approverMatchesRecipient(parsed, recipient));
  }

  function entryLog(entry, level, message) {
    if (!entry || typeof entry.onLog !== "function") return;
    try { entry.onLog(level, message); } catch {}
  }

  function pendingTestLog(level, message) {
    for (const entry of pendingApprovals.values()) {
      if (typeof entry.onLog === "function") entryLog(entry, level, message);
    }
  }

  function safeUpdateCard(entry, status) {
    const targetChannel = channel;
    if (!targetChannel || !entry || typeof targetChannel.updateCard !== "function") return;
    const messageIds = [...new Set([
      ...(Array.isArray(entry.messageIds) ? entry.messageIds : []),
      entry.messageId,
      entry.eventMessageId,
    ].filter(Boolean))];
    if (!messageIds.length) return;
    const card = buildFeishuResolvedCard({
      title: entry.title,
      detail: entry.detail,
      status,
    });
    for (const messageId of messageIds) {
      targetChannel.updateCard(messageId, card).catch((err) => {
        safeLog("debug", "Feishu approval card update failed", { error: err && err.message });
      });
    }
  }

  function finishApproval(id, decision, status) {
    const entry = pendingApprovals.get(id);
    if (!entry) return;
    pendingApprovals.delete(id);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.signal && entry.onAbort) {
      try { entry.signal.removeEventListener("abort", entry.onAbort); } catch {}
    }
    safeUpdateCard(entry, status || (decision && decision.action === "allow" ? "allowed" : (decision ? "denied" : "expired")));
    entry.resolve(decision);
  }

  function clearAllApprovals() {
    for (const id of Array.from(pendingApprovals.keys())) {
      finishApproval(id, null, "expired");
    }
  }

  // ── v3: elicitation (AskUserQuestion answered in Feishu) ──
  function optionLabelOf(option) {
    if (typeof option === "string") return option;
    if (option && typeof option === "object") return option.label || option.text || option.value || "";
    return "";
  }

  function buildAnswersByText(entry) {
    const answers = {};
    entry.questions.forEach((question, qIdx) => {
      const text = question && typeof question.question === "string" ? question.question : "";
      if (text && Object.prototype.hasOwnProperty.call(entry.answers, qIdx)) {
        answers[text] = entry.answers[qIdx];
      }
    });
    return answers;
  }

  function safeUpdateElicitationCard(entry, status, detail) {
    const targetChannel = channel;
    if (!targetChannel || !entry || typeof targetChannel.updateCard !== "function") return;
    const messageIds = [...new Set([
      ...(Array.isArray(entry.messageIds) ? entry.messageIds : []),
      entry.messageId,
      entry.eventMessageId,
    ].filter(Boolean))];
    if (!messageIds.length) return;
    const card = buildFeishuResolvedCard({ title: entry.title, detail: detail || "", status });
    for (const messageId of messageIds) {
      targetChannel.updateCard(messageId, card).catch((err) => {
        safeLog("debug", "Feishu elicitation card update failed", { error: err && err.message });
      });
    }
  }

  function finishElicitation(id, decision, status, detail) {
    const entry = pendingElicitations.get(id);
    if (!entry) return;
    pendingElicitations.delete(id);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.signal && entry.onAbort) {
      try { entry.signal.removeEventListener("abort", entry.onAbort); } catch {}
    }
    safeUpdateElicitationCard(entry, status, detail);
    entry.resolve(decision);
  }

  function clearAllElicitations() {
    for (const id of Array.from(pendingElicitations.keys())) {
      finishElicitation(id, null, "timed_out", "");
    }
  }

  function nextUnansweredQuestionIndex(entry) {
    for (let i = 0; i < entry.questions.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(entry.answers, i)) return i;
    }
    return -1;
  }

  // Record one answer; finalize (resolve {action:"answer", answers}) once every
  // question has an answer.
  function recordElicitationAnswer(entry, questionIndex, answerLabel) {
    const label = trimString(answerLabel, 800);
    if (!label || questionIndex < 0 || questionIndex >= entry.questions.length) return;
    entry.answers[questionIndex] = label;
    if (Object.keys(entry.answers).length < entry.questions.length) {
      entryLog(entry, "info", `Recorded a Feishu answer for question ${questionIndex + 1}/${entry.questions.length}.`);
      return;
    }
    const answers = buildAnswersByText(entry);
    const detail = entry.questions
      .map((question, i) => `**${compactLogText(question && question.question, 120)}**\n${compactLogText(entry.answers[i], 200)}`)
      .join("\n\n");
    entryLog(entry, "info", "All Feishu questions answered.");
    finishElicitation(entry.id, { action: "answer", answers }, "answered", detail);
  }

  function handleElicitCardAction(parsed) {
    const entry = pendingElicitations.get(parsed.nonce);
    if (!entry) {
      pendingTestLog("warn", "Received a Feishu question action for a stale or unknown card.");
      return;
    }
    entry.eventMessageId = parsed.messageId || entry.eventMessageId;
    if (!isAllowedApprover(parsed, entry)) {
      entryLog(entry, "warn", "Ignored a Feishu question action from an unauthorized approver.");
      return;
    }
    const question = entry.questions[parsed.questionIndex];
    const options = question && Array.isArray(question.options) ? question.options : [];
    const label = optionLabelOf(options[parsed.optionIndex]);
    if (!label) {
      entryLog(entry, "warn", "Ignored a Feishu question action with an unknown option index.");
      return;
    }
    recordElicitationAnswer(entry, parsed.questionIndex, label);
  }

  // Free-text reply ("Other"): apply to the most recent pending elicitation for
  // an authorized approver, filling its next unanswered question.
  function handleElicitationTextReply(parsed) {
    const text = trimString(parsed.text, 800);
    if (!text) return false;
    for (const entry of [...pendingElicitations.values()].reverse()) {
      if (!isAllowedApprover(parsed, entry)) continue;
      const questionIndex = nextUnansweredQuestionIndex(entry);
      if (questionIndex === -1) continue;
      recordElicitationAnswer(entry, questionIndex, text);
      return true;
    }
    return false;
  }

  async function handleCardAction(event) {
    const statusAction = parseFeishuStatusAction(event);
    if (statusAction) {
      await handleStatusCardAction(statusAction);
      return true;
    }
    const elicitAction = parseFeishuElicitAction(event);
    if (elicitAction) {
      handleElicitCardAction(elicitAction);
      return true;
    }
    const parsed = parseFeishuCardAction(event);
    if (!parsed) {
      pendingTestLog("warn", "Received a Feishu card action, but its callback payload was not recognized.");
      return false;
    }
    const entry = pendingApprovals.get(parsed.nonce);
    if (!entry) {
      pendingTestLog("warn", "Received a Feishu card action for a stale or unknown test card.");
      return true;
    }
    entry.eventMessageId = parsed.messageId || entry.eventMessageId;
    if (!isAllowedApprover(parsed, entry)) {
      safeLog("debug", "Feishu approval ignored unauthorized card action");
      entryLog(entry, "warn", "Received a Feishu card action, but the approver did not match the configured allowed IDs.");
      return true;
    }
    if (parsed.action === "suggestion" && (!entry.suggestionIndexes || !entry.suggestionIndexes.has(parsed.index))) {
      safeLog("debug", "Feishu approval ignored forged suggestion card action");
      entryLog(entry, "warn", "Received a Feishu suggestion action that was not present on this card.");
      return true;
    }
    entryLog(entry, "info", `Received allowed Feishu card action: ${parsed.action}.`);
    const decision = parsed.action === "suggestion"
      ? { action: "suggestion", index: parsed.index }
      : { action: parsed.action };
    finishApproval(parsed.nonce, decision, parsed.action === "allow" || parsed.action === "suggestion" ? "allowed" : "denied");
    return true;
  }

  function buildStatusSummaryFallback() {
    const own = getStatus();
    return {
      pendingApprovalCount: pendingApprovals.size,
      doNotDisturb: false,
      providers: [{
        id: "feishu",
        label: "Feishu",
        configured: true,
        enabled: own.enabled === true,
        status: own.started ? (own.enabled === true ? "running" : "stopped") : "stopped",
        pendingApprovalCount: own.pendingApprovalCount || 0,
        lastError: own.lastError || null,
      }],
    };
  }

  function getStatusText() {
    let summary = null;
    if (typeof getStatusSummary === "function") {
      try {
        summary = getStatusSummary();
      } catch (err) {
        setLastError("status", err);
        safeLog("warn", "Feishu status command summary failed", { error: err && err.message });
      }
    }
    return formatRemoteApprovalStatusText(summary && typeof summary === "object"
      ? summary
      : buildStatusSummaryFallback());
  }

  async function sendStatusReply(parsed, text, options = {}) {
    const config = currentConfig();
    const to = parsed.chatId || config.receiveId;
    if (!to || !text || !channel || typeof channel.send !== "function") return;
    const opts = {
      idType: parsed.chatId ? "chat_id" : config.receiveIdType,
    };
    if (parsed.messageId) opts.replyTo = parsed.messageId;
    const input = options.card === true
      ? { card: buildFeishuStatusCard({ statusText: text }) }
      : { text };
    await channel.send(to, input, opts);
  }

  async function handleStatusCardAction(parsed) {
    const config = currentConfig();
    if (config.statusCommandEnabled !== true) return true;
    if (!isAllowedApprover(parsed, config)) {
      safeLog("debug", "Feishu status card refresh ignored unauthorized sender");
      return true;
    }
    try {
      const card = buildFeishuStatusCard({ statusText: getStatusText() });
      if (parsed.messageId && channel && typeof channel.updateCard === "function") {
        await channel.updateCard(parsed.messageId, card);
      } else {
        await sendStatusReply(parsed, getStatusText(), { card: true });
      }
    } catch (err) {
      setLastError("status", err);
      safeLog("warn", "Feishu status card refresh failed", { error: err && err.message });
    }
    return true;
  }

  async function handleMessage(event) {
    const parsed = parseFeishuMessage(event);
    if (!parsed) return false;
    const command = parseMessageCommand(parsed.text);
    if (!command || command.command !== "status") {
      // v3: a non-command message may be a free-text "Other" answer to a pending question.
      if (!command && handleElicitationTextReply(parsed)) return true;
      return false;
    }
    const config = currentConfig();
    if (config.statusCommandEnabled !== true) return true;
    if (!isAllowedApprover(parsed, config)) {
      safeLog("debug", "Feishu status command ignored unauthorized sender");
      return true;
    }
    try {
      await sendStatusReply(parsed, getStatusText(), {
        card: command.args.toLowerCase() === "card",
      });
    } catch (err) {
      setLastError("status", err);
      safeLog("warn", "Feishu status command reply failed", { error: err && err.message });
    }
    return true;
  }

  function requestApproval(payload, options = {}) {
    const config = currentConfig();
    const signal = options && options.signal;
    const recipients = getEffectiveFeishuRecipients(config);
    const onLog = options && typeof options.onLog === "function" ? options.onLog : null;
    // v3.2: no self-timeout for real approvals; only set a timer when the caller
    // explicitly bounds it (the "send test card" diagnostic does).
    const timeoutMs = options && Number.isFinite(options.timeoutMs) ? options.timeoutMs : null;
    const title = compactLogText(payload && payload.title, 160);
    const detail = compactLogText(payload && payload.detail, 1800);
    if (!isEnabled() || !recipients.length || !title || (signal && signal.aborted)) {
      if (onLog) onLog("warn", "Feishu approval runner is not enabled or the request was aborted.");
      return Promise.resolve(null);
    }
    const id = randomIdFn();
    let card;
    try {
      card = buildFeishuApprovalCard({ nonce: id, title, detail, suggestions: payload && payload.suggestions });
    } catch (err) {
      setLastError("approval", err);
      if (onLog) onLog("error", `Could not build Feishu approval card: ${err && err.message ? err.message : err}`);
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const entry = {
        resolve,
        title,
        detail,
        messageId: "",
        messageIds: [],
        eventMessageId: "",
        recipients,
        suggestionIndexes: normalizeSuggestionIndexes(payload && payload.suggestions),
        signal,
        onAbort: null,
        timer: null,
        onLog,
      };
      pendingApprovals.set(id, entry);

      entryLog(entry, "info", "Sending Feishu approval card.");
      if (Number.isFinite(timeoutMs)) {
        entry.timer = setTimeout(() => {
          entryLog(
            entry,
            "warn",
            "Timed out waiting for Feishu card action callback. If the card was delivered, confirm the app subscribes to card.action.trigger and long-connection events are enabled.",
          );
          finishApproval(id, null, "timed_out");
        }, timeoutMs);
        if (entry.timer && typeof entry.timer.unref === "function") entry.timer.unref();
      }

      if (signal) {
        entry.onAbort = () => {
          // v3: the abort cause (carried in signal.reason) tells us WHY this card
          // is being closed — resolved locally on desktop/terminal, or superseded
          // by another provider — so the resolved card stops mislabeling every
          // non-Feishu outcome as "Expired".
          const cause = abortCauseStatus(signal);
          entryLog(entry, "warn", `Feishu approval request was resolved elsewhere (${cause}) before a card action arrived.`);
          finishApproval(id, null, cause);
        };
        signal.addEventListener("abort", entry.onAbort, { once: true });
      }

      let deliveredCount = 0;
      let settledCount = 0;
      let lastSendError = null;
      for (const recipient of recipients) {
        channel.send(recipient.receiveId, { card }, { idType: recipient.receiveIdType })
        .then((result) => {
          const current = pendingApprovals.get(id);
          if (!current || (signal && signal.aborted)) return;
          const messageId = extractMessageId(result);
          if (messageId) {
            current.messageIds.push(messageId);
            if (!current.messageId) current.messageId = messageId;
          }
          deliveredCount += 1;
          entryLog(current, "info", "Card sent; waiting for Allow/Deny.");
          safeLog("debug", "Feishu approval card sent");
        })
        .catch((err) => {
          if (signal && signal.aborted) {
            finishApproval(id, null, "expired");
            return;
          }
          lastSendError = err;
          safeLog("warn", "Feishu approval send failed", { error: err && err.message });
        })
        .finally(() => {
          settledCount += 1;
          if (settledCount !== recipients.length || deliveredCount > 0) return;
          const err = lastSendError || new Error("Feishu approval card send failed");
          setLastError("approval", err);
          entryLog(entry, "error", `Feishu approval card send failed: ${err && err.message ? err.message : err}`);
          finishApproval(id, null, "expired");
        });
      }
    });
  }

  // v3: send an AskUserQuestion to Feishu and resolve with {action:"answer",
  // answers:{[questionText]:answer}} once every question is answered (via option
  // buttons or a free-text reply), or null on timeout/abort/send-failure.
  function requestElicitation(payload, options = {}) {
    const config = currentConfig();
    const signal = options && options.signal;
    const recipients = getEffectiveFeishuRecipients(config);
    const onLog = options && typeof options.onLog === "function" ? options.onLog : null;
    // v3.2: no self-timeout — question cards persist until answered or aborted.
    const timeoutMs = options && Number.isFinite(options.timeoutMs) ? options.timeoutMs : null;
    const questions = Array.isArray(payload && payload.questions)
      ? payload.questions.filter((q) => q && typeof q.question === "string" && q.question.trim() && Array.isArray(q.options))
      : [];
    if (!isEnabled() || !recipients.length || !questions.length || (signal && signal.aborted)) {
      if (onLog) onLog("warn", "Feishu elicitation is not enabled or the request was aborted.");
      return Promise.resolve(null);
    }
    const id = randomIdFn();
    let card;
    try {
      card = buildFeishuQuestionCard({ nonce: id, questions });
    } catch (err) {
      setLastError("elicitation", err);
      if (onLog) onLog("error", `Could not build Feishu question card: ${err && err.message ? err.message : err}`);
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const entry = {
        id,
        resolve,
        title: "Clawd needs your input",
        questions,
        answers: {},
        messageId: "",
        messageIds: [],
        eventMessageId: "",
        recipients,
        signal,
        onAbort: null,
        timer: null,
        onLog,
      };
      pendingElicitations.set(id, entry);

      entryLog(entry, "info", "Sending Feishu question card.");
      if (Number.isFinite(timeoutMs)) {
        entry.timer = setTimeout(() => {
          entryLog(entry, "warn", "Timed out waiting for a Feishu question answer.");
          finishElicitation(id, null, "timed_out", "");
        }, timeoutMs);
        if (entry.timer && typeof entry.timer.unref === "function") entry.timer.unref();
      }

      if (signal) {
        entry.onAbort = () => {
          const cause = abortCauseStatus(signal);
          entryLog(entry, "warn", `Feishu question was resolved elsewhere (${cause}) before an answer arrived.`);
          finishElicitation(id, null, cause, "");
        };
        signal.addEventListener("abort", entry.onAbort, { once: true });
      }

      let deliveredCount = 0;
      let settledCount = 0;
      let lastSendError = null;
      for (const recipient of recipients) {
        channel.send(recipient.receiveId, { card }, { idType: recipient.receiveIdType })
        .then((result) => {
          const current = pendingElicitations.get(id);
          if (!current || (signal && signal.aborted)) return;
          const messageId = extractMessageId(result);
          if (messageId) {
            current.messageIds.push(messageId);
            if (!current.messageId) current.messageId = messageId;
          }
          deliveredCount += 1;
          entryLog(current, "info", "Question card sent; waiting for an answer.");
        })
        .catch((err) => {
          if (signal && signal.aborted) {
            finishElicitation(id, null, abortCauseStatus(signal), "");
            return;
          }
          lastSendError = err;
          safeLog("warn", "Feishu question send failed", { error: err && err.message });
        })
        .finally(() => {
          settledCount += 1;
          if (settledCount !== recipients.length || deliveredCount > 0) return;
          const err = lastSendError || new Error("Feishu question card send failed");
          setLastError("elicitation", err);
          entryLog(entry, "error", `Feishu question card send failed: ${err && err.message ? err.message : err}`);
          finishElicitation(id, null, "timed_out", "");
        });
      }
    });
  }

  async function sendTestCard() {
    const collector = createTestLogCollector();
    const addLog = collector.add;
    addLog("info", "Starting Feishu test card check.");
    if (!isEnabled()) {
      addLog("info", "Starting Feishu approval runner.");
      const startResult = await start();
      if (startResult.status !== "ok") {
        addLog("error", startResult.message || startResult.reason || "Feishu approval runner did not start.");
        return { ...startResult, logs: collector.logs };
      }
      addLog("info", "Feishu approval runner started.");
    } else {
      addLog("info", "Feishu approval runner is already running.");
    }
    const errorBefore = lastError;
    const decision = await requestApproval({
      title: "Clawd Feishu approval test",
      detail: "Tap Allow once or Deny to verify Feishu card callbacks.",
    }, {
      onLog: addLog,
      // The manual test is the ONLY bounded path (so Settings doesn't spin forever).
      timeoutMs: testCardTimeoutMs,
    });
    if (!decision && lastError && lastError !== errorBefore && lastError.scope === "approval") {
      return { status: "error", message: lastError.message || "Feishu approval send failed", logs: collector.logs };
    }
    if (decision) {
      addLog("info", `Feishu test completed with decision: ${decision.action}.`);
      return { status: "ok", decision: decision.action, logs: collector.logs };
    }
    return {
      status: "timeout",
      message: "No Feishu card action callback was received before timeout.",
      logs: collector.logs,
    };
  }

  async function sendNotification(text) {
    const config = currentConfig();
    if (config.notifyOnComplete !== true) {
      return { ok: false, errorClass: "disabled" };
    }
    if (!isEnabled() || !channel || typeof channel.send !== "function") {
      return { ok: false, errorClass: "not_active" };
    }
    const safeText = compactNotificationText(text);
    if (!safeText) return { ok: false, errorClass: "empty" };
    const recipients = getEffectiveFeishuRecipients(config);
    if (!recipients.length) return { ok: false, errorClass: "not_active" };
    try {
      const results = await Promise.allSettled(recipients.map((recipient) => (
        channel.send(recipient.receiveId, { text: safeText }, { idType: recipient.receiveIdType })
      )));
      const messageIds = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => extractMessageId(result.value))
        .filter(Boolean);
      if (messageIds.length) {
        return messageIds.length === 1
          ? { ok: true, messageId: messageIds[0] }
          : { ok: true, messageId: messageIds[0], messageIds };
      }
      const firstRejected = results.find((result) => result.status === "rejected");
      throw firstRejected ? firstRejected.reason : new Error("Feishu completion notification send failed");
    } catch (err) {
      setLastError("notification", err);
      safeLog("warn", "Feishu completion notification send failed", { error: err && err.message });
      return {
        ok: false,
        errorClass: "send_failed",
        message: compactLogText(err && err.message ? err.message : err, 160),
      };
    }
  }

  return {
    isEnabled,
    start,
    stop,
    requestApproval,
    requestElicitation,
    sendNotification,
    sendTestCard,
    getStatus,
    _pendingApprovals: pendingApprovals,
    _pendingElicitations: pendingElicitations,
  };
}

module.exports = {
  DEFAULT_TEST_CARD_TIMEOUT_MS,
  createFeishuApprovalRunner,
  createSdkChannel,
  domainForRegion,
  extractMessageId,
  parseFeishuMessage,
};
