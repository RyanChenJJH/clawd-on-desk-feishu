"use strict";

const {
  compactLogText,
  defaultNormalizeDecision,
} = require("./decision");

function providerId(client, index) {
  const raw = client && (client.id || client.name || client.providerId);
  const text = compactLogText(raw, 64);
  return text || `provider-${index + 1}`;
}

function isClientEnabled(client) {
  if (!client || typeof client.requestApproval !== "function") return false;
  if (typeof client.isEnabled !== "function") return true;
  try {
    return client.isEnabled() !== false;
  } catch {
    return false;
  }
}

function createController() {
  return typeof AbortController === "function" ? new AbortController() : null;
}

function supportsRichApproval(client) {
  if (!client || typeof client !== "object") return false;
  if (client.supportsRichApproval === true) return true;
  return !!(client.capabilities && client.capabilities.supportsRichApproval === true);
}

function startRemoteApprovalFanout({
  clients,
  payload,
  normalizeDecision = defaultNormalizeDecision,
  onDecision,
  log = () => {},
} = {}) {
  const entries = [];
  let settled = false;
  let aborted = false;

  function safeLog(message) {
    try { log(message); } catch {}
  }

  // v3: abort carries a reason (forwarded to each provider's AbortSignal.reason)
  // so a provider's resolved card can say WHY it was cancelled. "superseded"
  // = another provider decided; callers pass "answered_elsewhere" when the
  // local desktop/terminal resolved the request.
  function abort(reason) {
    if (aborted) return;
    aborted = true;
    for (const entry of entries) {
      if (entry.controller) {
        try { entry.controller.abort(reason); } catch {}
      }
    }
  }

  function settle(normalized, id) {
    if (aborted || settled || !normalized) return;
    settled = true;
    abort("superseded");
    if (typeof onDecision === "function") {
      onDecision(normalized, { providerId: id });
    }
  }

  const list = Array.isArray(clients) ? clients : [];
  list.forEach((client, index) => {
    if (!isClientEnabled(client)) return;
    const id = providerId(client, index);
    const controller = createController();
    const options = controller ? { signal: controller.signal } : {};
    let request;
    try {
      request = client.requestApproval(payload, options);
    } catch (err) {
      safeLog(`${id} remote approval failed: ${compactLogText(err && err.message ? err.message : err)}`);
      return;
    }
    const entry = { id, controller };
    entries.push(entry);
    Promise.resolve(request)
      .then((decision) => {
        if (aborted || settled) return;
        const normalized = normalizeDecision(decision);
        if (!normalized) return;
        if (normalized.action === "suggestion" && !supportsRichApproval(client)) {
          safeLog(`${id} remote approval ignored rich decision because provider does not support rich approval`);
          return;
        }
        settle(normalized, id);
      })
      .catch((err) => {
        if (aborted) return;
        safeLog(`${id} remote approval failed: ${compactLogText(err && err.message ? err.message : err)}`);
      });
  });

  return {
    started: entries.length > 0,
    providerCount: entries.length,
    abort,
  };
}

module.exports = {
  compactLogText,
  defaultNormalizeDecision,
  startRemoteApprovalFanout,
  supportsRichApproval,
};
