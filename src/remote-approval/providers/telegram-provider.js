"use strict";

function createTelegramApprovalProvider({ getClient } = {}) {
  return {
    id: "telegram",
    label: "Telegram",
    // requiresExplicitSummary: Telegram only gets a card when the agent
    // supplied a real description/summary/reason — never Clawd's synthesized
    // summary. Preserves the conservative "no black-box card to a 3rd-party
    // bot" behavior. (Feishu opts out and receives synthesized summaries.)
    capabilities: { supportsRichApproval: true, requiresExplicitSummary: true },
    getClient: typeof getClient === "function" ? getClient : () => null,
  };
}

module.exports = {
  createTelegramApprovalProvider,
};
