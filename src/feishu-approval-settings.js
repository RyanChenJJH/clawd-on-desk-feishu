"use strict";

const path = require("path");

const DEFAULT_FEISHU_APPROVAL = Object.freeze({
  enabled: false,
  region: "feishu",
  receiveIdType: "chat_id",
  receiveId: "",
  allowedOpenId: "",
  allowedUserId: "",
  recipients: [],
  notifyOnComplete: false,
  completionOutputMode: "off",
  statusCommandEnabled: true,
  // v3: answer AskUserQuestion in Feishu (default off, opt-in).
  elicitationEnabled: false,
});

const FEISHU_REGIONS = Object.freeze(["feishu", "lark"]);
const FEISHU_RECEIVE_ID_TYPES = Object.freeze(["chat_id", "open_id", "user_id"]);
const FEISHU_COMPLETION_OUTPUT_MODES = Object.freeze(["off", "full"]);
const FEISHU_APP_ID_RE = /^cli_[A-Za-z0-9_-]{6,}$/;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function trimString(value, maxLen = 512) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function cloneDefaultFeishuApproval() {
  return { ...DEFAULT_FEISHU_APPROVAL };
}

function normalizeRegion(value, fallback = DEFAULT_FEISHU_APPROVAL.region) {
  const region = trimString(value, 32).toLowerCase();
  if (FEISHU_REGIONS.includes(region)) return region;
  return FEISHU_REGIONS.includes(fallback) ? fallback : DEFAULT_FEISHU_APPROVAL.region;
}

function normalizeReceiveIdType(value, fallback = DEFAULT_FEISHU_APPROVAL.receiveIdType) {
  const type = trimString(value, 32).toLowerCase();
  if (FEISHU_RECEIVE_ID_TYPES.includes(type)) return type;
  return FEISHU_RECEIVE_ID_TYPES.includes(fallback) ? fallback : DEFAULT_FEISHU_APPROVAL.receiveIdType;
}

function normalizeCompletionOutputMode(value, fallback = DEFAULT_FEISHU_APPROVAL.completionOutputMode) {
  const mode = trimString(value, 32).toLowerCase();
  if (mode === "tail") return "full";
  if (FEISHU_COMPLETION_OUTPUT_MODES.includes(mode)) return mode;
  return FEISHU_COMPLETION_OUTPUT_MODES.includes(fallback) ? fallback : DEFAULT_FEISHU_APPROVAL.completionOutputMode;
}

function normalizeFeishuRecipient(value, fallbackReceiveIdType = DEFAULT_FEISHU_APPROVAL.receiveIdType) {
  if (!isPlainObject(value)) return null;
  return {
    receiveIdType: normalizeReceiveIdType(value.receiveIdType, fallbackReceiveIdType),
    receiveId: trimString(value.receiveId, 256),
    allowedOpenId: trimString(value.allowedOpenId, 256),
    allowedUserId: trimString(value.allowedUserId, 256),
  };
}

function normalizeFeishuRecipients(value, fallbackReceiveIdType = DEFAULT_FEISHU_APPROVAL.receiveIdType) {
  if (!Array.isArray(value)) return [];
  const recipients = [];
  for (const entry of value) {
    const normalized = normalizeFeishuRecipient(entry, fallbackReceiveIdType);
    if (!normalized) continue;
    recipients.push(normalized);
    if (recipients.length >= 20) break;
  }
  return recipients;
}

function normalizeFeishuApproval(value, defaultsValue = DEFAULT_FEISHU_APPROVAL) {
  const defaults = isPlainObject(defaultsValue) ? defaultsValue : DEFAULT_FEISHU_APPROVAL;
  const out = {
    enabled: defaults.enabled === true,
    region: normalizeRegion(defaults.region),
    receiveIdType: normalizeReceiveIdType(defaults.receiveIdType),
    receiveId: trimString(defaults.receiveId, 256),
    allowedOpenId: trimString(defaults.allowedOpenId, 256),
    allowedUserId: trimString(defaults.allowedUserId, 256),
    recipients: normalizeFeishuRecipients(defaults.recipients, defaults.receiveIdType),
    notifyOnComplete: defaults.notifyOnComplete === true,
    completionOutputMode: normalizeCompletionOutputMode(defaults.completionOutputMode),
    statusCommandEnabled: defaults.statusCommandEnabled !== false,
    elicitationEnabled: defaults.elicitationEnabled === true,
  };
  if (!isPlainObject(value)) return out;
  if (typeof value.enabled === "boolean") out.enabled = value.enabled;
  if (typeof value.region === "string") out.region = normalizeRegion(value.region, out.region);
  if (typeof value.receiveIdType === "string") out.receiveIdType = normalizeReceiveIdType(value.receiveIdType, out.receiveIdType);
  if (typeof value.receiveId === "string") out.receiveId = trimString(value.receiveId, 256);
  if (typeof value.allowedOpenId === "string") out.allowedOpenId = trimString(value.allowedOpenId, 256);
  if (typeof value.allowedUserId === "string") out.allowedUserId = trimString(value.allowedUserId, 256);
  if (Array.isArray(value.recipients)) out.recipients = normalizeFeishuRecipients(value.recipients, out.receiveIdType);
  if (typeof value.notifyOnComplete === "boolean") out.notifyOnComplete = value.notifyOnComplete;
  if (typeof value.completionOutputMode === "string") {
    out.completionOutputMode = normalizeCompletionOutputMode(value.completionOutputMode, out.completionOutputMode);
  }
  if (typeof value.statusCommandEnabled === "boolean") out.statusCommandEnabled = value.statusCommandEnabled;
  if (typeof value.elicitationEnabled === "boolean") out.elicitationEnabled = value.elicitationEnabled;
  return out;
}

function validateFeishuApproval(value) {
  if (!isPlainObject(value)) {
    return { status: "error", message: "feishuApproval must be a plain object" };
  }
  for (const key of Object.keys(value)) {
    if (![
      "enabled",
      "region",
      "receiveIdType",
      "receiveId",
      "allowedOpenId",
      "allowedUserId",
      "recipients",
      "notifyOnComplete",
      "completionOutputMode",
      "statusCommandEnabled",
      "elicitationEnabled",
    ].includes(key)) {
      return { status: "error", message: `feishuApproval.${key} is not supported` };
    }
  }
  if (typeof value.enabled !== "boolean") {
    return { status: "error", message: "feishuApproval.enabled must be a boolean" };
  }
  if (value.region !== undefined && (typeof value.region !== "string" || !FEISHU_REGIONS.includes(value.region))) {
    return { status: "error", message: "feishuApproval.region must be feishu|lark" };
  }
  if (
    value.receiveIdType !== undefined
    && (typeof value.receiveIdType !== "string" || !FEISHU_RECEIVE_ID_TYPES.includes(value.receiveIdType))
  ) {
    return { status: "error", message: "feishuApproval.receiveIdType must be chat_id|open_id|user_id" };
  }
  for (const key of ["receiveId", "allowedOpenId", "allowedUserId"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      return { status: "error", message: `feishuApproval.${key} must be a string` };
    }
  }
  if (value.recipients !== undefined) {
    if (!Array.isArray(value.recipients)) {
      return { status: "error", message: "feishuApproval.recipients must be an array" };
    }
    for (const [index, entry] of value.recipients.entries()) {
      if (!isPlainObject(entry)) {
        return { status: "error", message: `feishuApproval.recipients[${index}] must be a plain object` };
      }
      for (const key of Object.keys(entry)) {
        if (!["receiveIdType", "receiveId", "allowedOpenId", "allowedUserId"].includes(key)) {
          return { status: "error", message: `feishuApproval.recipients[${index}].${key} is not supported` };
        }
      }
      if (
        entry.receiveIdType !== undefined
        && (typeof entry.receiveIdType !== "string" || !FEISHU_RECEIVE_ID_TYPES.includes(entry.receiveIdType))
      ) {
        return { status: "error", message: `feishuApproval.recipients[${index}].receiveIdType must be chat_id|open_id|user_id` };
      }
      for (const key of ["receiveId", "allowedOpenId", "allowedUserId"]) {
        if (entry[key] !== undefined && typeof entry[key] !== "string") {
          return { status: "error", message: `feishuApproval.recipients[${index}].${key} must be a string` };
        }
      }
    }
  }
  if (value.notifyOnComplete !== undefined && typeof value.notifyOnComplete !== "boolean") {
    return { status: "error", message: "feishuApproval.notifyOnComplete must be a boolean" };
  }
  if (
    value.completionOutputMode !== undefined
    && (typeof value.completionOutputMode !== "string" || !FEISHU_COMPLETION_OUTPUT_MODES.includes(value.completionOutputMode))
  ) {
    return { status: "error", message: "feishuApproval.completionOutputMode must be off|full" };
  }
  if (value.statusCommandEnabled !== undefined && typeof value.statusCommandEnabled !== "boolean") {
    return { status: "error", message: "feishuApproval.statusCommandEnabled must be a boolean" };
  }
  if (value.elicitationEnabled !== undefined && typeof value.elicitationEnabled !== "boolean") {
    return { status: "error", message: "feishuApproval.elicitationEnabled must be a boolean" };
  }
  return { status: "ok" };
}

function validateFeishuCredentials({ appId, appSecret } = {}) {
  const id = trimString(appId, 128);
  const secret = trimString(appSecret, 1024);
  if (!id) return { status: "error", message: "Feishu App ID is required" };
  if (!FEISHU_APP_ID_RE.test(id)) return { status: "error", message: "Feishu App ID format is invalid" };
  if (!secret) return { status: "error", message: "Feishu App Secret is required" };
  if (secret.length < 8) return { status: "error", message: "Feishu App Secret is too short" };
  return { status: "ok", appId: id, appSecret: secret };
}

function defaultCredentialsEnvFilePath(userDataDir) {
  return userDataDir ? path.join(userDataDir, "feishu-approval.env") : "";
}

function buildCredentialsEnvFile(credentials) {
  const valid = validateFeishuCredentials(credentials);
  if (valid.status !== "ok") return valid;
  return {
    status: "ok",
    text: [
      `CLAWD_FEISHU_APP_ID=${valid.appId}`,
      `CLAWD_FEISHU_APP_SECRET=${valid.appSecret}`,
      "",
    ].join("\n"),
  };
}

function writeCredentialsEnvFile({
  fs,
  path: pathModule = path,
  filePath,
  appId,
  appSecret,
  platform = process.platform,
} = {}) {
  if (!fs || typeof fs.writeFileSync !== "function") {
    return { status: "error", message: "writeCredentialsEnvFile requires fs" };
  }
  if (!filePath || typeof filePath !== "string") {
    return { status: "error", message: "Feishu credentials env file path is required" };
  }
  const built = buildCredentialsEnvFile({ appId, appSecret });
  if (built.status !== "ok") return built;
  try {
    const dir = pathModule.dirname(filePath);
    const base = pathModule.basename(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = pathModule.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
    let fd = null;
    try {
      fd = fs.openSync(tmpPath, "wx", 0o600);
      fs.writeFileSync(fd, built.text, { encoding: "utf8" });
      fs.closeSync(fd);
      fd = null;
      if (platform !== "win32" && typeof fs.chmodSync === "function") fs.chmodSync(tmpPath, 0o600);
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      if (fd != null && typeof fs.closeSync === "function") {
        try { fs.closeSync(fd); } catch {}
      }
      if (typeof fs.rmSync === "function") {
        try { fs.rmSync(tmpPath, { force: true }); } catch {}
      }
      throw err;
    }
    if (platform !== "win32" && typeof fs.chmodSync === "function") {
      try { fs.chmodSync(filePath, 0o600); } catch {}
    }
    return { status: "ok", credentialsStored: true, filePath };
  } catch (err) {
    return { status: "error", message: `Feishu credentials write failed: ${err && err.message ? err.message : err}` };
  }
}

function credentialsStatus({ fs, filePath } = {}) {
  let fileExists = false;
  let credentialsFileMtimeMs = 0;
  if (fs && filePath && typeof fs.existsSync === "function") {
    try { fileExists = fs.existsSync(filePath); } catch { fileExists = false; }
    if (fileExists && typeof fs.statSync === "function") {
      try {
        const stat = fs.statSync(filePath);
        credentialsFileMtimeMs = stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0;
      } catch {
        credentialsFileMtimeMs = 0;
      }
    }
  }
  return {
    credentialsConfigured: fileExists,
    credentialsStored: fileExists,
    credentialsFileMtimeMs,
  };
}

function maskFeishuSecret(secret) {
  const value = trimString(secret, 1024);
  if (!value) return "";
  if (value.length < 10) return "******";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function parseCredentialsEnvText(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(CLAWD_FEISHU_APP_ID|CLAWD_FEISHU_APP_SECRET)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    out[match[1]] = match[2];
  }
  return out;
}

function readCredentialsInfo({ fs, filePath } = {}) {
  if (!fs || !filePath || typeof fs.readFileSync !== "function") {
    return { configured: false, appId: "", maskedAppSecret: "" };
  }
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return { configured: false, appId: "", maskedAppSecret: "" };
  }
  const env = parseCredentialsEnvText(text);
  const appId = trimString(env.CLAWD_FEISHU_APP_ID, 128);
  const secret = trimString(env.CLAWD_FEISHU_APP_SECRET, 1024);
  return {
    configured: !!(appId && secret),
    appId,
    maskedAppSecret: maskFeishuSecret(secret),
  };
}

function readCredentialsEnvFile({ fs, filePath } = {}) {
  if (!fs || !filePath || typeof fs.readFileSync !== "function") {
    return { appId: "", appSecret: "" };
  }
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return { appId: "", appSecret: "" };
  }
  const env = parseCredentialsEnvText(text);
  return {
    appId: trimString(env.CLAWD_FEISHU_APP_ID, 128),
    appSecret: trimString(env.CLAWD_FEISHU_APP_SECRET, 1024),
  };
}

function redactionSecretsForFeishuApproval(config) {
  const normalized = normalizeFeishuApproval(config);
  return [...new Set([
    normalized.receiveId,
    normalized.allowedOpenId,
    normalized.allowedUserId,
    ...normalized.recipients.flatMap((entry) => [
      entry.receiveId,
      entry.allowedOpenId,
      entry.allowedUserId,
    ]),
  ].filter(Boolean))];
}

function getEffectiveFeishuRecipients(config) {
  const normalized = normalizeFeishuApproval(config);
  const recipients = normalized.recipients.filter((entry) => (
    entry.receiveId && (entry.allowedOpenId || entry.allowedUserId)
  ));
  if (recipients.length) return recipients;
  if (normalized.receiveId && (normalized.allowedOpenId || normalized.allowedUserId)) {
    return [{
      receiveIdType: normalized.receiveIdType,
      receiveId: normalized.receiveId,
      allowedOpenId: normalized.allowedOpenId,
      allowedUserId: normalized.allowedUserId,
    }];
  }
  return [];
}

function readiness(config, credentials) {
  const normalized = normalizeFeishuApproval(config);
  if (!normalized.enabled) return { ready: false, reason: "disabled", config: normalized };
  const valid = validateFeishuApproval(normalized);
  if (valid.status !== "ok") return { ready: false, reason: "invalid-config", message: valid.message, config: normalized };
  if (!credentials || credentials.credentialsConfigured !== true) {
    return { ready: false, reason: "missing-credentials", message: "Feishu app credentials are not configured", config: normalized };
  }
  if (!normalized.receiveId && !normalized.recipients.some((entry) => entry.receiveId)) {
    return { ready: false, reason: "missing-recipient", message: "Feishu receive id is not configured", config: normalized };
  }
  if (
    !normalized.allowedOpenId
    && !normalized.allowedUserId
    && !normalized.recipients.some((entry) => entry.allowedOpenId || entry.allowedUserId)
  ) {
    return { ready: false, reason: "missing-approver", message: "Feishu allowed approver id is not configured", config: normalized };
  }
  if (!getEffectiveFeishuRecipients(normalized).length) {
    return { ready: false, reason: "missing-recipient", message: "Feishu receive id and allowed approver must be configured on the same recipient", config: normalized };
  }
  return { ready: true, config: normalized };
}

module.exports = {
  DEFAULT_FEISHU_APPROVAL,
  FEISHU_REGIONS,
  FEISHU_RECEIVE_ID_TYPES,
  FEISHU_COMPLETION_OUTPUT_MODES,
  cloneDefaultFeishuApproval,
  normalizeFeishuRecipient,
  normalizeFeishuRecipients,
  normalizeFeishuApproval,
  validateFeishuApproval,
  validateFeishuCredentials,
  defaultCredentialsEnvFilePath,
  buildCredentialsEnvFile,
  writeCredentialsEnvFile,
  credentialsStatus,
  maskFeishuSecret,
  readCredentialsInfo,
  readCredentialsEnvFile,
  redactionSecretsForFeishuApproval,
  getEffectiveFeishuRecipients,
  readiness,
};
