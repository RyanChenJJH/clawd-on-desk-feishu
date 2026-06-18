"use strict";

const {
  createTelegramCompanion,
  dedupeKey,
  formatAssistantOutputSection,
  formatNotification,
  isCompletion,
  redactAssistantOutputText,
} = require("../telegram-companion");

function createRemoteApprovalCompletionNotifier(options = {}) {
  return createTelegramCompanion(options);
}

module.exports = {
  createRemoteApprovalCompletionNotifier,
  dedupeKey,
  formatAssistantOutputSection,
  formatNotification,
  isCompletion,
  redactAssistantOutputText,
};
