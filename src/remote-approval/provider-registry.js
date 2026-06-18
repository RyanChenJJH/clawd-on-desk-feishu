"use strict";

function cleanText(value, maxLen = 80) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  return text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").slice(0, maxLen);
}

function safeCall(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function hasApprovalRequest(client) {
  return !!(client && typeof client.requestApproval === "function");
}

function normalizeProvider(provider, index) {
  if (!provider || typeof provider !== "object") return null;
  const id = cleanText(provider.id || provider.providerId || provider.name, 64) || `provider-${index + 1}`;
  const label = cleanText(provider.label, 80) || id;
  const getClient = typeof provider.getClient === "function"
    ? () => safeCall(() => provider.getClient(), null)
    : () => provider;

  function getRequestClient() {
    const client = getClient();
    if (!hasApprovalRequest(client)) return null;
    return client;
  }

  function isConfigured() {
    if (typeof provider.isConfigured === "function") {
      const configured = safeCall(() => provider.isConfigured(), false);
      if (configured === false) return false;
    }
    return !!getRequestClient();
  }

  function isEnabled() {
    if (!isConfigured()) return false;
    if (typeof provider.isEnabled === "function" && safeCall(() => provider.isEnabled(), false) === false) {
      return false;
    }
    const client = getRequestClient();
    if (!client) return false;
    if (typeof client.isEnabled === "function") {
      return safeCall(() => client.isEnabled() !== false, false);
    }
    return true;
  }

  return {
    id,
    label,
    capabilities: provider.capabilities && typeof provider.capabilities === "object"
      ? { ...provider.capabilities }
      : {},
    isConfigured,
    isEnabled,
    getStatus: () => {
      const raw = typeof provider.getStatus === "function"
        ? safeCall(() => provider.getStatus(), {})
        : {};
      return {
        id,
        label,
        configured: isConfigured(),
        enabled: isEnabled(),
        ...(raw && typeof raw === "object" ? raw : {}),
      };
    },
    requestApproval: (payload, options) => {
      const client = getRequestClient();
      if (!client || !isEnabled()) return null;
      return client.requestApproval(payload, options);
    },
  };
}

function createRemoteApprovalProviderRegistry({ providers = [] } = {}) {
  const entries = [];

  function register(provider) {
    const normalized = normalizeProvider(provider, entries.length);
    if (!normalized) return null;
    entries.push(normalized);
    return normalized;
  }

  for (const provider of Array.isArray(providers) ? providers : []) {
    register(provider);
  }

  return {
    register,
    listAllProviders: () => entries.slice(),
    listApprovalProviders: () => entries.filter((provider) => provider.isEnabled()),
    getStatus: () => entries.map((provider) => provider.getStatus()),
  };
}

module.exports = {
  createRemoteApprovalProviderRegistry,
  normalizeProvider,
};
