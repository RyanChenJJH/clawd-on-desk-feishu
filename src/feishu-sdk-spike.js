"use strict";

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TEXT_LEN = 1200;
const VALID_REGIONS = new Set(["feishu", "lark"]);
const PHASE1_RECEIVE_ID_TYPE = "chat_id";
const CALLBACK_RE = /^clawd:approval:([a-z0-9_-]{4,64}):(allow|deny)$/i;

function trimString(value, maxLen = 512) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function compactText(value, maxLen = MAX_TEXT_LEN) {
  let text = typeof value === "string" ? value : String(value == null ? "" : value);
  text = text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, Math.max(0, maxLen - 3))}...`;
  return text;
}

function normalizeRegion(value) {
  const region = trimString(value, 32).toLowerCase();
  return VALID_REGIONS.has(region) ? region : "feishu";
}

function normalizeTimeoutMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(n), 10 * 60 * 1000);
}

function normalizeSpikeConfig(input = {}, env = process.env) {
  const src = input && typeof input === "object" ? input : {};
  const envObj = env && typeof env === "object" ? env : {};
  const appId = trimString(src.appId || envObj.CLAWD_FEISHU_APP_ID || envObj.FEISHU_APP_ID, 128);
  const appSecret = trimString(src.appSecret || envObj.CLAWD_FEISHU_APP_SECRET || envObj.FEISHU_APP_SECRET, 512);
  const receiveIdType = trimString(
    src.receiveIdType || envObj.CLAWD_FEISHU_RECEIVE_ID_TYPE || envObj.FEISHU_RECEIVE_ID_TYPE || PHASE1_RECEIVE_ID_TYPE,
    32,
  ).toLowerCase();
  const receiveId = trimString(src.receiveId || envObj.CLAWD_FEISHU_RECEIVE_ID || envObj.FEISHU_RECEIVE_ID, 256);
  const allowedOpenId = trimString(src.allowedOpenId || envObj.CLAWD_FEISHU_ALLOWED_OPEN_ID || envObj.FEISHU_ALLOWED_OPEN_ID, 256);
  const allowedUserId = trimString(src.allowedUserId || envObj.CLAWD_FEISHU_ALLOWED_USER_ID || envObj.FEISHU_ALLOWED_USER_ID, 256);
  const region = normalizeRegion(src.region || envObj.CLAWD_FEISHU_REGION || envObj.FEISHU_REGION);
  const timeoutMs = normalizeTimeoutMs(src.timeoutMs || envObj.CLAWD_FEISHU_SPIKE_TIMEOUT_MS || envObj.FEISHU_SPIKE_TIMEOUT_MS);

  const config = {
    appId,
    appSecret,
    receiveIdType,
    receiveId,
    allowedOpenId,
    allowedUserId,
    region,
    timeoutMs,
  };
  config.safeSummary = {
    appIdConfigured: !!appId,
    appSecretConfigured: !!appSecret,
    receiveIdType,
    receiveIdConfigured: !!receiveId,
    allowedOpenIdConfigured: !!allowedOpenId,
    allowedUserIdConfigured: !!allowedUserId,
    region,
    timeoutMs,
  };
  return config;
}

function validateSpikeConfig(config) {
  const normalized = normalizeSpikeConfig(config, {});
  const missing = [];
  if (!normalized.appId) missing.push("appId");
  if (!normalized.appSecret) missing.push("appSecret");
  if (!normalized.receiveId) missing.push("receiveId");
  if (missing.length) {
    return {
      status: "error",
      code: "MISSING_CONFIG",
      missing,
      message: `Missing Feishu spike config: ${missing.join(", ")}`,
      config: normalized,
    };
  }
  if (normalized.receiveIdType !== PHASE1_RECEIVE_ID_TYPE) {
    return {
      status: "error",
      code: "UNSUPPORTED_RECEIVE_ID_TYPE",
      message: "Phase 1 SDK Channel spike only supports receiveIdType=chat_id. open_id/user_id should be verified later through the runner/OpenAPI path.",
      config: normalized,
    };
  }
  return { status: "ok", config: normalized };
}

function assertFeishuSdkCapabilities(sdk) {
  if (!sdk || typeof sdk !== "object") {
    throw new Error("Feishu SDK export is not an object");
  }
  if (typeof sdk.createLarkChannel !== "function") {
    throw new Error("Feishu SDK createLarkChannel export is missing");
  }
  if (typeof sdk.Client !== "function") {
    throw new Error("Feishu SDK Client export is missing");
  }
  return {
    hasClient: true,
    hasEventDispatcher: typeof sdk.EventDispatcher === "function",
    hasCreateLarkChannel: true,
    hasWSClient: typeof sdk.WSClient === "function",
  };
}

function loadFeishuSdk(requireFn = require) {
  try {
    const sdk = requireFn("@larksuiteoapi/node-sdk");
    const capabilities = assertFeishuSdkCapabilities(sdk);
    return { status: "ok", sdk, capabilities };
  } catch (err) {
    const moduleMissing = err && (err.code === "MODULE_NOT_FOUND" || err.code === "ERR_MODULE_NOT_FOUND");
    return {
      status: "error",
      code: moduleMissing ? "SDK_MISSING" : "SDK_INVALID",
      message: moduleMissing
        ? "Feishu SDK is not installed. Run: npm install @larksuiteoapi/node-sdk"
        : `Feishu SDK capability check failed: ${err && err.message ? err.message : String(err)}`,
    };
  }
}

function domainForRegion(sdk, region) {
  const normalized = normalizeRegion(region);
  if (sdk && sdk.Domain) {
    if (normalized === "lark" && sdk.Domain.Lark) return sdk.Domain.Lark;
    if (normalized === "feishu" && sdk.Domain.Feishu) return sdk.Domain.Feishu;
  }
  return normalized === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
}

function randomId() {
  return Math.random().toString(36).slice(2, 12);
}

function callbackValue(nonce, action) {
  return `clawd:approval:${nonce}:${action}`;
}

function buildButton(text, value, type) {
  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: text,
    },
    type,
    width: "fill",
    behaviors: [{ type: "callback", value }],
  };
}

function buildSpikeApprovalCard({ nonce, title, detail } = {}) {
  const id = compactText(nonce, 64);
  if (!id) throw new Error("nonce is required");
  const safeTitle = compactText(title || "Clawd Feishu approval test", 120);
  const safeDetail = compactText(detail || "Tap Allow once or Deny to verify Feishu card callbacks.", MAX_TEXT_LEN);
  return {
    schema: "2.0",
    config: {
      wide_screen_mode: true,
    },
    header: {
      template: "blue",
      title: {
        tag: "plain_text",
        content: safeTitle,
      },
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: safeDetail,
        },
        {
          tag: "column_set",
          flex_mode: "none",
          background_style: "default",
          columns: [
            {
              tag: "column",
              width: "weighted",
              weight: 1,
              elements: [buildButton("Allow once", callbackValue(id, "allow"), "primary")],
            },
            {
              tag: "column",
              width: "weighted",
              weight: 1,
              elements: [buildButton("Deny", callbackValue(id, "deny"), "danger")],
            },
          ],
        },
      ],
    },
  };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseSpikeCardAction(event) {
  if (!event || typeof event !== "object") return null;
  const value = firstString(
    event.value,
    event.action && event.action.value,
    event.event && event.event.action && event.event.action.value,
    event.raw && event.raw.action && event.raw.action.value,
  );
  const match = value.match(CALLBACK_RE);
  if (!match) return null;
  const operator = event.operator || event.user || event.sender || {};
  return {
    nonce: match[1],
    action: match[2].toLowerCase(),
    openId: firstString(operator.openId, operator.open_id, operator.openid, event.openId, event.open_id),
    userId: firstString(operator.userId, operator.user_id, event.userId, event.user_id),
  };
}

function isAllowedApprover(parsed, config) {
  if (!parsed) return false;
  if (config.allowedOpenId && parsed.openId !== config.allowedOpenId) return false;
  if (config.allowedUserId && parsed.userId !== config.allowedUserId) return false;
  return true;
}

function timeoutError() {
  const err = new Error("Timed out waiting for Feishu approval card callback");
  err.code = "SPIKE_TIMEOUT";
  return err;
}

async function runFeishuSdkSpike(input = {}, options = {}) {
  const valid = validateSpikeConfig(input);
  if (valid.status !== "ok") return valid;
  const config = valid.config;

  const sdkResult = options.sdk
    ? { status: "ok", sdk: options.sdk, capabilities: assertFeishuSdkCapabilities(options.sdk) }
    : loadFeishuSdk(options.requireFn || require);
  if (sdkResult.status !== "ok") return sdkResult;

  const sdk = sdkResult.sdk;
  const nonce = typeof options.randomId === "function" ? options.randomId() : randomId();
  const channelFactory = typeof options.channelFactory === "function"
    ? options.channelFactory
    : sdk.createLarkChannel;
  const channel = channelFactory({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: domainForRegion(sdk, config.region),
    transport: "websocket",
    loggerLevel: sdk.LoggerLevel && (sdk.LoggerLevel.warn || sdk.LoggerLevel.info),
    policy: {
      dmMode: "open",
      requireMention: false,
    },
  });
  if (!channel || typeof channel.on !== "function" || typeof channel.connect !== "function" || typeof channel.send !== "function") {
    return {
      status: "error",
      code: "CHANNEL_INVALID",
      message: "Feishu SDK createLarkChannel did not return a usable channel",
    };
  }

  let timer = null;
  let settled = false;
  const actionPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(timeoutError()), config.timeoutMs);
    if (timer && typeof timer.unref === "function") timer.unref();
    channel.on("cardAction", (event) => {
      const parsed = parseSpikeCardAction(event);
      if (!parsed || parsed.nonce !== nonce || !isAllowedApprover(parsed, config) || settled) return;
      settled = true;
      resolve(parsed);
    });
  });

  try {
    await channel.connect();
    const card = buildSpikeApprovalCard({
      nonce,
      title: "Clawd Feishu approval test",
      detail: "This is a phase 1 SDK spike card. It is not attached to any agent permission request.",
    });
    const sendResult = await channel.send(config.receiveId, { card });
    const parsed = await actionPromise;
    return {
      status: "ok",
      decision: parsed.action,
      nonce,
      messageId: sendResult && (sendResult.messageId || sendResult.message_id || sendResult.id),
      approver: {
        openIdConfigured: !!config.allowedOpenId,
        userIdConfigured: !!config.allowedUserId,
      },
    };
  } catch (err) {
    if (err && err.code === "SPIKE_TIMEOUT") {
      return { status: "timeout", code: "TIMEOUT", message: err.message, nonce };
    }
    return {
      status: "error",
      code: err && err.code ? String(err.code) : "SPIKE_FAILED",
      message: err && err.message ? err.message : String(err),
      nonce,
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (channel && typeof channel.disconnect === "function") {
      try { await channel.disconnect(); } catch {}
    }
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  PHASE1_RECEIVE_ID_TYPE,
  assertFeishuSdkCapabilities,
  buildSpikeApprovalCard,
  callbackValue,
  domainForRegion,
  loadFeishuSdk,
  normalizeSpikeConfig,
  parseSpikeCardAction,
  runFeishuSdkSpike,
  validateSpikeConfig,
};
