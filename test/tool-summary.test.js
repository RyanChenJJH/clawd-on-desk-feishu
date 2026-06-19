"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildToolApprovalSummary,
  synthesize,
  displayPath,
  hostOf,
  mcpToolLabel,
} = require("../src/remote-approval/tool-summary");

const CWD = process.platform === "win32" ? "D:\\work\\proj" : "/work/proj";
const FILE = process.platform === "win32" ? "D:\\work\\proj\\src\\auth.js" : "/work/proj/src/auth.js";

test("explicit summary is passed through with source=explicit", () => {
  const r = buildToolApprovalSummary({ toolName: "Bash", toolInput: {} }, { explicitSummary: "Run project tests" });
  assert.deepEqual(r, { text: "Run project tests", source: "explicit" });
});

test("Edit/Write/Read synthesize action + relative path", () => {
  assert.equal(synthesize({ toolName: "Edit", toolInput: { file_path: FILE } }, CWD), "Edit src/auth.js");
  assert.equal(synthesize({ toolName: "Write", toolInput: { file_path: FILE } }, CWD), "Write src/auth.js");
  assert.equal(synthesize({ toolName: "Read", toolInput: { file_path: FILE } }, CWD), "Read src/auth.js");
  assert.equal(synthesize({ toolName: "MultiEdit", toolInput: { file_path: FILE } }, CWD), "Edit src/auth.js");
  assert.equal(synthesize({ toolName: "NotebookEdit", toolInput: { notebook_path: FILE } }, CWD), "Edit notebook src/auth.js");
});

test("Glob/Grep synthesize pattern (+path); WebFetch host; WebSearch query", () => {
  assert.equal(synthesize({ toolName: "Glob", toolInput: { pattern: "**/*.ts" } }, CWD), "Glob **/*.ts");
  assert.equal(synthesize({ toolName: "Grep", toolInput: { pattern: "TODO", path: FILE } }, CWD), "Grep TODO in src/auth.js");
  assert.equal(synthesize({ toolName: "WebFetch", toolInput: { url: "https://example.com/a?b=1" } }, CWD), "Fetch example.com");
  assert.equal(synthesize({ toolName: "WebSearch", toolInput: { query: "node test runner" } }, CWD), "Search: node test runner");
});

test("MCP tool labels server/tool; unknown tool lists key names only", () => {
  assert.equal(mcpToolLabel("mcp__playwright__browser_click"), "playwright/browser_click");
  assert.equal(mcpToolLabel("Edit"), null);
  assert.equal(synthesize({ toolName: "mcp__playwright__browser_click", toolInput: { ref: "x", text: "y" } }, CWD), "MCP playwright/browser_click (ref, text)");
  assert.equal(synthesize({ toolName: "SomeTool", toolInput: { a: 1, b: 2 } }, CWD), "SomeTool (a, b)");
});

test("synthesized summaries are redacted and capped via injected redactor", () => {
  const calls = [];
  const redact = (t) => { calls.push(t); return "REDACTED"; };
  const r = buildToolApprovalSummary(
    { toolName: "Bash", toolInput: { command: "curl -H 'Authorization: Bearer sk-abc' x" } },
    { redact }
  );
  assert.equal(r.source, "synthesized");
  assert.equal(r.text, "REDACTED");
  assert.equal(calls.length, 1); // raw synthesized text handed to the redactor
});

test("displayPath: under cwd -> relative (posix slashes); else basename", () => {
  assert.equal(displayPath(FILE, CWD), "src/auth.js");
  const outside = process.platform === "win32" ? "C:\\other\\x.js" : "/other/x.js";
  assert.equal(displayPath(outside, CWD), "x.js");
  assert.equal(displayPath("", CWD), "");
});

test("hostOf parses host or returns empty", () => {
  assert.equal(hostOf("https://docs.example.com/x"), "docs.example.com");
  assert.equal(hostOf("not a url"), "");
});

test("empty/garbage permEntry yields a non-empty fallback (tool name)", () => {
  const r = buildToolApprovalSummary({ toolName: "Edit", toolInput: {} }, { cwd: CWD });
  assert.equal(r.source, "synthesized");
  assert.equal(typeof r.text, "string");
  assert.ok(r.text.length > 0);
});
