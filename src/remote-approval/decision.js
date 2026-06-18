"use strict";

function compactLogText(value, maxLen = 200) {
  let text = typeof value === "string" ? value : String(value == null ? "" : value);
  text = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > maxLen) text = `${text.slice(0, Math.max(0, maxLen - 3))}...`;
  return text;
}

function defaultNormalizeDecision(decision) {
  if (decision === "allow" || decision === "deny") return { action: decision };
  if (!decision || typeof decision !== "object") return null;
  if (decision.action === "allow" || decision.action === "deny") return { action: decision.action };
  if (decision.decision === "allow" || decision.decision === "deny") return { action: decision.decision };
  if (decision.action === "suggestion") {
    const index = Number(decision.index);
    return Number.isInteger(index) && index >= 0 ? { action: "suggestion", index } : null;
  }
  return null;
}

module.exports = {
  compactLogText,
  defaultNormalizeDecision,
};
