"use strict";

function createFeishuApprovalProvider({ getClient } = {}) {
  return {
    id: "feishu",
    label: "Feishu",
    // requiresExplicitSummary:false (explicit/self-documenting) — Feishu is a
    // private 1:1 channel, so it receives synthesized tool summaries too (v4
    // all-tools coverage). This is the opt-out that broadens Feishu only.
    capabilities: { supportsRichApproval: true, requiresExplicitSummary: false },
    getClient: typeof getClient === "function" ? getClient : () => null,
  };
}

module.exports = {
  createFeishuApprovalProvider,
};
