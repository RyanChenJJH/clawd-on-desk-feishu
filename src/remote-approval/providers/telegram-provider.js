"use strict";

function createTelegramApprovalProvider({ getClient } = {}) {
  return {
    id: "telegram",
    label: "Telegram",
    capabilities: { supportsRichApproval: true },
    getClient: typeof getClient === "function" ? getClient : () => null,
  };
}

module.exports = {
  createTelegramApprovalProvider,
};
