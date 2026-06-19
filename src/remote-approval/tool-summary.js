"use strict";

const path = require("path");

// Fork module (Feishu remote-approval v4, all-tools coverage). Produces a
// safe, tool-aware one-line summary for ANY agent tool so remote-approval
// cards are no longer limited to tools that happen to carry
// description/summary/reason. Pure + injectable redactor so it stays
// decoupled from src/permission.js and is unit-testable in isolation.

const DEFAULT_MAX = 200;

function asText(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function firstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function displayPath(filePath, cwd) {
  const p = typeof filePath === "string" ? filePath.trim() : "";
  if (!p) return "";
  if (cwd && typeof cwd === "string") {
    try {
      const rel = path.relative(cwd, p);
      if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
        return rel.split(path.sep).join("/");
      }
    } catch {}
  }
  // fall back to basename to avoid leaking absolute/home directory structure
  const base = p.split(/[\\/]/).filter(Boolean).pop();
  return base || p;
}

function hostOf(url) {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return "";
  try {
    return new URL(u).host || "";
  } catch {}
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(u);
  return m ? m[1] : "";
}

function mcpToolLabel(toolName) {
  if (typeof toolName !== "string" || !toolName.startsWith("mcp__")) return null;
  const parts = toolName.split("__");
  if (parts.length < 3) return null;
  const server = parts[1];
  const tool = parts.slice(2).join("__");
  if (!server || !tool) return null;
  return `${server}/${tool}`;
}

function keyHint(input) {
  const keys = input && typeof input === "object" ? Object.keys(input) : [];
  return keys.slice(0, 6).join(", ");
}

function synthesize(permEntry, cwd) {
  const toolName = firstString(permEntry && permEntry.toolName) || "Unknown";
  const input = permEntry && permEntry.toolInput && typeof permEntry.toolInput === "object"
    ? permEntry.toolInput
    : {};

  switch (toolName) {
    case "Edit":
    case "MultiEdit":
      return `Edit ${displayPath(input.file_path, cwd)}`.trim();
    case "Write":
      return `Write ${displayPath(input.file_path, cwd)}`.trim();
    case "NotebookEdit":
      return `Edit notebook ${displayPath(input.notebook_path || input.file_path, cwd)}`.trim();
    case "Read":
      return `Read ${displayPath(input.file_path, cwd)}`.trim();
    case "Glob": {
      const where = input.path ? ` in ${displayPath(input.path, cwd)}` : "";
      return `Glob ${firstString(input.pattern)}${where}`.trim();
    }
    case "Grep": {
      const where = input.path ? ` in ${displayPath(input.path, cwd)}` : "";
      return `Grep ${firstString(input.pattern)}${where}`.trim();
    }
    case "Bash":
      return `Run: ${firstString(input.command)}`.trim();
    case "WebFetch": {
      const host = hostOf(input.url);
      return host ? `Fetch ${host}` : "Fetch a URL";
    }
    case "WebSearch":
      return `Search: ${firstString(input.query)}`.trim();
    default: {
      const mcp = mcpToolLabel(toolName);
      const hint = keyHint(input);
      if (mcp) return hint ? `MCP ${mcp} (${hint})` : `MCP ${mcp}`;
      return hint ? `${toolName} (${hint})` : toolName;
    }
  }
}

function buildToolApprovalSummary(
  permEntry,
  { explicitSummary = "", cwd = "", redact = asText, maxLen = DEFAULT_MAX } = {}
) {
  const explicit = typeof explicitSummary === "string" ? explicitSummary.trim() : "";
  if (explicit) {
    // Already redacted by the caller (buildRemoteApprovalSummary). Keep as-is.
    return { text: explicit, source: "explicit" };
  }
  let text = redact(synthesize(permEntry, cwd));
  text = asText(text).trim();
  if (text.length > maxLen) text = `${text.slice(0, Math.max(0, maxLen - 1))}…`;
  return { text, source: "synthesized" };
}

module.exports = {
  buildToolApprovalSummary,
  synthesize,
  displayPath,
  hostOf,
  mcpToolLabel,
};
