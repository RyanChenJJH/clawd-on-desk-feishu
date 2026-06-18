"use strict";

const { compactLogText } = require("./decision");

function buildRemoteSuggestionLabel(suggestion) {
  if (!suggestion || typeof suggestion !== "object") return "";
  if (suggestion.type === "setMode") {
    if (suggestion.mode === "acceptEdits") return "Auto edits";
    if (suggestion.mode === "plan") return "Plan mode";
    const mode = compactLogText(suggestion.mode || "", 18);
    return mode ? `Mode: ${mode}` : "";
  }
  if (suggestion.type === "addRules") {
    const rules = Array.isArray(suggestion.rules) ? suggestion.rules : [suggestion];
    const first = rules.find((rule) => rule && typeof rule === "object") || {};
    const behavior = compactLogText(suggestion.behavior || first.behavior || "allow", 12);
    const isDeny = behavior === "deny";
    const toolName = compactLogText(first.toolName || suggestion.toolName || "", 16);
    if (toolName) return isDeny ? `Always deny ${toolName}` : `Always ${toolName}`;
    return isDeny ? "Always deny" : "Always allow";
  }
  return "";
}

function buildRemoteSuggestionButtons(suggestions) {
  const list = Array.isArray(suggestions) ? suggestions : [];
  const seen = new Set();
  const buttons = [];
  list.forEach((suggestion, index) => {
    const label = compactLogText(buildRemoteSuggestionLabel(suggestion), 28);
    if (!label || seen.has(label)) return;
    seen.add(label);
    buttons.push({ index, label });
  });
  return buttons;
}

module.exports = {
  buildRemoteSuggestionButtons,
  buildRemoteSuggestionLabel,
};
