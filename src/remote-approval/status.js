"use strict";

const { compactLogText } = require("./decision");

const MAX_STATUS_TEXT_LEN = 3600;

function bool(value) {
  return value === true;
}

function redactSensitiveText(value, maxLen = 200) {
  let text = compactLogText(value, maxLen);
  if (!text) return "";
  text = text.replace(
    /\b(appSecret|app_secret|app secret|token|botToken|bot_token|receiveId|receive_id|receive id|chatId|chat_id|chat id|openId|open_id|open id|userId|user_id|user id)\b\s*[:=]\s*["']?[^"',;\s)]+["']?/gi,
    (match) => {
      const keyMatch = match.match(/^[^:=]+/);
      const key = keyMatch ? keyMatch[0].trim() : "secret";
      return `${key}=<redacted>`;
    },
  );
  text = text.replace(/\b\d+:[A-Za-z0-9_-]{20,}\b/g, "<redacted:token>");
  text = text.replace(/\b(?:cli|oc|ou|on|om|u)_[A-Za-z0-9_-]{4,}\b/g, "<redacted:id>");
  return compactLogText(text, maxLen);
}

function providerText(value, fallback) {
  const text = compactLogText(value, 80);
  return text || fallback;
}

function readProviderStatus(provider) {
  if (!provider || typeof provider !== "object") return null;
  let raw = provider;
  if (typeof provider.getStatus === "function") {
    try {
      const result = provider.getStatus();
      raw = result && typeof result === "object" ? result : {};
    } catch {
      raw = {};
    }
  }

  const id = providerText(provider.id || raw.id, "provider");
  const label = providerText(provider.label || raw.label, id);
  const status = providerText(raw.status, bool(raw.enabled) ? "running" : "stopped");
  const out = {
    id,
    label,
    configured: bool(raw.configured),
    enabled: bool(raw.enabled),
    status,
  };
  if (raw.lastError) {
    const message = typeof raw.lastError === "string"
      ? raw.lastError
      : raw.lastError.message;
    const safeMessage = redactSensitiveText(message, 160);
    if (safeMessage) out.lastErrorMessage = safeMessage;
  }
  if (raw.lastErrorMessage) {
    const safeMessage = redactSensitiveText(raw.lastErrorMessage, 160);
    if (safeMessage) out.lastErrorMessage = safeMessage;
  }
  if (Number.isFinite(raw.pendingApprovalCount)) {
    out.pendingApprovalCount = Math.max(0, Math.floor(raw.pendingApprovalCount));
  }
  return out;
}

function summarizeRemoteApprovalStatus({
  providers = [],
  pendingApprovalCount = 0,
  doNotDisturb = false,
} = {}) {
  return {
    pendingApprovalCount: Number.isFinite(pendingApprovalCount)
      ? Math.max(0, Math.floor(pendingApprovalCount))
      : 0,
    doNotDisturb: doNotDisturb === true,
    providers: (Array.isArray(providers) ? providers : [])
      .map(readProviderStatus)
      .filter(Boolean),
  };
}

function formatRemoteApprovalStatusText(summary = {}) {
  const safe = summarizeRemoteApprovalStatus(summary);
  const lines = [
    "Clawd remote approval status",
    `DND: ${safe.doNotDisturb ? "on" : "off"}`,
    `Pending approvals: ${safe.pendingApprovalCount}`,
  ];

  if (safe.providers.length) {
    lines.push("Providers:");
    for (const provider of safe.providers) {
      const flags = [
        provider.enabled ? "enabled" : "disabled",
        provider.configured ? "configured" : "not configured",
      ];
      if (Number.isFinite(provider.pendingApprovalCount)) {
        flags.push(`pending ${provider.pendingApprovalCount}`);
      }
      lines.push(`- ${provider.label}: ${provider.status} (${flags.join(", ")})`);
    }
  } else {
    lines.push("Providers: none");
  }

  const errors = safe.providers.filter((provider) => provider.lastErrorMessage);
  if (errors.length) {
    lines.push("Recent errors:");
    for (const provider of errors) {
      lines.push(`- ${provider.label}: ${redactSensitiveText(provider.lastErrorMessage, 160)}`);
    }
  }

  let text = lines.join("\n").trim();
  if (text.length > MAX_STATUS_TEXT_LEN) {
    text = `${text.slice(0, MAX_STATUS_TEXT_LEN - 3)}...`;
  }
  return text;
}

module.exports = {
  formatRemoteApprovalStatusText,
  redactSensitiveText,
  summarizeRemoteApprovalStatus,
};
