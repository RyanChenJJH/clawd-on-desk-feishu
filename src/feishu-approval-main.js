"use strict";

const {
  normalizeFeishuApproval,
  readiness,
} = require("./feishu-approval-settings");
const { createFeishuApprovalRunner } = require("./feishu-approval-runner");
const { redactSensitiveText } = require("./remote-approval/status");

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

function hasCredentials(credentials) {
  return !!(credentials && credentials.appId && credentials.appSecret);
}

function sanitizeLastError(error) {
  if (!error || typeof error !== "object") return error;
  return {
    ...error,
    message: redactSensitiveText(error.message || "", 200),
  };
}

function runtimeSignature(config, credentials) {
  return [
    config.region,
    credentials.appId,
    credentials.appSecret,
  ].join("\n");
}

function createFeishuApprovalMain({
  getConfig = () => ({}),
  getCredentials = () => ({}),
  createRunner = createFeishuApprovalRunner,
  getStatusSummary = null,
  log = () => {},
} = {}) {
  let runner = null;
  let activeSignature = "";
  let syncPromise = Promise.resolve();

  function currentConfig() {
    return normalizeFeishuApproval(getConfig());
  }

  function currentCredentials() {
    return normalizeCredentials(getCredentials());
  }

  function currentReadiness() {
    const config = currentConfig();
    const credentials = currentCredentials();
    return {
      config,
      credentials,
      ready: readiness(config, { credentialsConfigured: hasCredentials(credentials) }),
    };
  }

  function getRunner() {
    if (!runner) {
      runner = createRunner({
        getConfig: currentConfig,
        getCredentials: currentCredentials,
        log,
        getStatusSummary,
      });
    }
    return runner;
  }

  async function stop() {
    const current = runner;
    activeSignature = "";
    if (current && typeof current.stop === "function") {
      await current.stop();
    }
  }

  async function sync(reason = "settings") {
    const { config, credentials, ready } = currentReadiness();
    if (!ready.ready) {
      await stop();
      return { status: "skipped", reason: ready.reason || "not-ready" };
    }

    const nextSignature = runtimeSignature(config, credentials);
    if (runner && activeSignature && activeSignature !== nextSignature) {
      await stop();
    }

    const target = getRunner();
    if (!target || typeof target.start !== "function") {
      return { status: "error", message: "Feishu approval runner is not available" };
    }
    try {
      const result = await target.start();
      if (result && result.status === "ok") {
        activeSignature = nextSignature;
      }
      return result && typeof result === "object" ? result : { status: "ok" };
    } catch (err) {
      return {
        status: "error",
        message: err && err.message ? err.message : String(err),
      };
    } finally {
      try { log("debug", "sync complete", { reason }); } catch {}
    }
  }

  function queueSync(reason = "settings") {
    syncPromise = syncPromise
      .catch(() => {})
      .then(() => sync(reason));
    return syncPromise;
  }

  function getClient() {
    const current = runner;
    if (!current || typeof current.requestApproval !== "function") return null;
    if (typeof current.isEnabled === "function" && current.isEnabled() === false) return null;
    return {
      id: "feishu",
      isEnabled: () => (typeof current.isEnabled === "function" ? current.isEnabled() !== false : true),
      requestApproval: (payload, options) => current.requestApproval(payload, options),
      // v3: answer AskUserQuestion in Feishu. Gated by config.elicitationEnabled
      // at the call site (main.getRemoteElicitationClients).
      requestElicitation: (payload, options) => (
        typeof current.requestElicitation === "function"
          ? current.requestElicitation(payload, options)
          : Promise.resolve(null)
      ),
      sendNotification: (text, options) => (
        typeof current.sendNotification === "function"
          ? current.sendNotification(text, options)
          : Promise.resolve({ ok: false, errorClass: "not_supported" })
      ),
    };
  }

  async function sendTest() {
    const { ready } = currentReadiness();
    if (!ready.ready) {
      return {
        status: "error",
        reason: ready.reason || "not-ready",
        message: ready.message || "Feishu approval is not configured",
      };
    }
    const started = await sync("test");
    if (!started || started.status !== "ok") return started;
    const current = getRunner();
    if (!current || typeof current.sendTestCard !== "function") {
      return { status: "error", message: "Feishu approval runner cannot send test cards" };
    }
    return current.sendTestCard();
  }

  function getStatus() {
    const { config, credentials, ready } = currentReadiness();
    const runnerStatus = runner && typeof runner.getStatus === "function"
      ? runner.getStatus()
      : {};
    const started = runnerStatus && runnerStatus.started === true;
    const enabled = config.enabled === true;
    const base = {
      status: started && (!runnerStatus || runnerStatus.enabled !== false) ? "running" : (ready.ready ? "ready" : "stopped"),
      configured: ready.ready,
      enabled,
      reason: ready.reason || "",
      message: ready.message || "",
      region: config.region,
      receiveIdType: config.receiveIdType,
      credentialsStored: hasCredentials(credentials),
    };
    if (runnerStatus && runnerStatus.lastError) {
      base.lastError = sanitizeLastError(runnerStatus.lastError);
      if (!started && ready.ready) {
        base.status = "failed";
        base.message = base.lastError.message || base.message;
      }
    }
    if (runnerStatus && Number.isFinite(runnerStatus.pendingApprovalCount)) {
      base.pendingApprovalCount = runnerStatus.pendingApprovalCount;
    }
    if (runnerStatus && runnerStatus.connectionStatus !== undefined) {
      base.connectionStatus = runnerStatus.connectionStatus;
    }
    return base;
  }

  return {
    sync,
    queueSync,
    getClient,
    sendTest,
    getStatus,
    stop,
  };
}

module.exports = {
  createFeishuApprovalMain,
};
