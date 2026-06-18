"use strict";

function createFeishuApprovalProvider({ getClient } = {}) {
  return {
    id: "feishu",
    label: "Feishu",
    capabilities: { supportsRichApproval: true },
    getClient: typeof getClient === "function" ? getClient : () => null,
  };
}

module.exports = {
  createFeishuApprovalProvider,
};
