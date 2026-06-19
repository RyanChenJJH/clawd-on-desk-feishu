"use strict";

const {
  normalizeFeishuApproval,
  readiness,
} = require("./feishu-approval-settings");
const { redactSensitiveText } = require("./remote-approval/status");

function bool(value) {
  return value === true;
}

function safeStatus(value, fallback = "unknown") {
  const text = redactSensitiveText(value, 80);
  return text || fallback;
}

function lastErrorMessage(runtimeStatus) {
  const err = runtimeStatus && runtimeStatus.lastError;
  const message = typeof err === "string" ? err : (err && err.message);
  return redactSensitiveText(message || runtimeStatus && runtimeStatus.message || "", 200);
}

function buildFeishuApprovalDiagnostic({
  config,
  credentials,
  runtimeStatus,
} = {}) {
  const normalized = normalizeFeishuApproval(config);
  if (!normalized.enabled) {
    return {
      enabled: false,
      configured: false,
      status: "disabled",
      health: "off",
      detail: "Feishu approval is disabled",
      hints: [],
      recentError: "",
    };
  }

  const ready = readiness(normalized, credentials || {});
  const missing = [];
  const hints = [];
  if (!credentials || credentials.credentialsConfigured !== true) {
    missing.push("credentials");
    hints.push("Configure Feishu App ID and App Secret in Settings -> Remote Approval -> Feishu.");
  }
  if (!normalized.receiveId) {
    missing.push("recipient");
    hints.push("Set a Feishu receive id and matching receive id type.");
  }
  if (!normalized.allowedOpenId && !normalized.allowedUserId) {
    missing.push("approver");
    hints.push("Set at least one allowed Feishu approver open_id or user_id.");
  }

  const status = safeStatus(runtimeStatus && runtimeStatus.status, ready.ready ? "ready" : "stopped");
  const recentError = lastErrorMessage(runtimeStatus);
  const running = status === "running";
  const health = ready.ready && running
    ? "ok"
    : (ready.ready ? "runtime-warning" : "setup-needed");
  const detail = ready.ready
    ? (running ? "Feishu approval is running" : `Feishu approval is configured but runtime is ${status}`)
    : `Feishu approval setup incomplete: ${missing.join(", ")}`;

  return {
    enabled: true,
    configured: ready.ready === true,
    status,
    health,
    detail,
    hints,
    recentError,
    credentialsStored: bool(credentials && credentials.credentialsStored),
    connectionStatus: redactSensitiveText(runtimeStatus && runtimeStatus.connectionStatus, 80),
  };
}

function checkFeishuApprovalStatus(options = {}) {
  const prefs = options.prefs || {};
  const diagnostic = buildFeishuApprovalDiagnostic({
    config: prefs.feishuApproval,
    credentials: options.credentials,
    runtimeStatus: options.runtimeStatus,
  });

  if (!diagnostic.enabled) {
    return {
      id: "feishu-approval",
      status: "pass",
      level: null,
      detail: diagnostic.detail,
      diagnostic,
    };
  }

  if (!diagnostic.configured) {
    return {
      id: "feishu-approval",
      status: "fail",
      level: "warning",
      detail: diagnostic.detail,
      textHint: diagnostic.hints[0] || "Complete Feishu approval setup in Settings.",
      diagnostic,
    };
  }

  if (diagnostic.health !== "ok") {
    return {
      id: "feishu-approval",
      status: "fail",
      level: "warning",
      detail: diagnostic.recentError
        ? `${diagnostic.detail}; recent error: ${diagnostic.recentError}`
        : diagnostic.detail,
      textHint: "Open Settings -> Remote Approval -> Feishu and use Send Test to verify the app connection and card.action.trigger subscription.",
      diagnostic,
    };
  }

  return {
    id: "feishu-approval",
    status: "pass",
    level: null,
    detail: diagnostic.detail,
    diagnostic,
  };
}

module.exports = {
  buildFeishuApprovalDiagnostic,
  checkFeishuApprovalStatus,
};
