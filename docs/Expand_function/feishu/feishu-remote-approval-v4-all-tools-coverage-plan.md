# Feishu 远程审批 v4 — 全工具覆盖（All-Tools Coverage）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 `superpowers:executing-plans`（本会话内逐任务执行）实现本计划。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 让 Claude Code（及共用该路径的 Codex/Qwen/CodeBuddy）的**所有**工具审批与 AskUserQuestion 提问都能发到飞书，消除"桌面有提示但飞书收不到"的静默丢弃；**Telegram 行为保持一字不差**。

**Architecture:** 把"是否发远程"的判定从全局 payload 层（"有 description 才发"）**下沉到 per-provider 能力层**。新增 fork 本地的「工具感知安全摘要」生成器为任意工具合成可读且脱敏的一行摘要；payload 标记 `summarySource`（`explicit` / `synthesized`）；broker 对"要求显式摘要"的 provider（Telegram）withhold `synthesized` 摘要，飞书则全收。AskUserQuestion 走既有 elicitation 通道，把默认开关打开。

**Tech Stack:** Node.js（内置 `node:test`）、Electron（测试中 mock）、纯逻辑模块；无新依赖。

## Global Constraints（来自 AGENTS.md + 本仓库 Fork 维护规范 / CLAUDE.md）

- **Fork 合并友好（最高优先）**：新增优先于修改；上游共享文件（`src/permission.js`）只做最小接入，实现下沉到 fork 模块（`src/remote-approval/`）；不改 `AGENTS.md` 等上游文档；尽量让上游既有测试**不改仍通过**，fork 行为用 fork 自己的新测试覆盖；差异下沉到 capability，不在共享路径写 provider 分支。
- **影响面=仅飞书**：不改变 Telegram 既有默认行为（无显式摘要不发卡）。
- **根因修复、禁止打补丁**：在摘要生成与 provider 能力层修，不在调用点做特例。
- **安全**：远程摘要必须脱敏（复用 `compactRemoteApprovalText`），**绝不含文件内容、diff、密钥**；只含"动作 + 目标"（文件相对路径 / 匹配模式 / 域名 / 命令首段）。
- **测试**：`node test/run-tests.js`（全量）；单文件用 `node --test test/<file>`（规避 Windows `ENAMETOOLONG`）。涉及 `/permission` 改动须做一次**真实 Claude Code + 真实飞书账号**走查（`curl` 自编 payload 不够）。
- **HTTP/资源约束**：端口 `127.0.0.1:23333-23337`；资源路径 `path.join(__dirname, …)`。
- 端到端单测目标进程：每个 green 步骤后立即 commit（小步）；最终 push 到 `origin`，PR 目标 `feature/health-reminder`。

---

## 背景与根因（已定位，证据见下）

**现象**：实测中 Claude 的"一些审批/需要我同意的申请"没有发到飞书，电脑界面正常提示。

**主根因** — `src/permission.js` 的 `buildRemoteApprovalSummary()`（约 915–929 行）只在 `tool_input` 含 `description`/`summary`/`reason` 时返回摘要；否则返回 `null` → `buildRemoteApprovalPayload()` 返回 `null`（约 942 行）→ `maybeStartRemoteApproval()` `return false`（约 1054 行），**静默不发**。而桌面气泡 `showPermissionBubble()` 无条件渲染完整 `tool_input`，所以桌面永远显示。

- 能到飞书：`Bash`、`Task`（自带 `description`）。
- 被静默丢弃：`Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`Read`/`Glob`/`Grep`/`WebFetch`/多数 MCP 工具。
- 铁证：`test/permission-telegram-approval.test.js:438` 明确断言"无 description/summary/reason 时 `maybeStartRemoteApproval===false`"。这是当初为 **Telegram** 安全设计（不把原始 tool_input/密钥发到第三方 bot），飞书 provider 复用了同一条 payload 路径而继承了它。

**次根因** — AskUserQuestion 走独立 elicitation 通道，受 `feishuApproval.elicitationEnabled` 控制，默认 `false`（`src/feishu-approval-settings.js:17`）。

**第三（设计如此，不在本次范围）** — `ExitPlanMode` 计划审阅被显式排除，只在桌面出现。

**已确认的决策（用户拍板）**：① 范围＝工具审批 + AskUserQuestion 都进飞书；② 影响面＝仅飞书，Telegram 不变。
**残余默认（用户认可）**：R1 `elicitationEnabled` 默认改为 `true`；R2 摘要文件目标用"相对 cwd 路径（取不到则文件名）"，绝不含内容/diff。

---

## File Structure（创建/修改清单）

| 文件 | 类型 | 责任 |
|------|------|------|
| `src/remote-approval/tool-summary.js` | **新增（fork）** | 纯函数：为任意工具产出 `{ text, source }` 安全摘要（explicit 透传 / synthesized 合成）。注入式 `redact`，与 permission.js 解耦、可单测。 |
| `test/tool-summary.test.js` | **新增（fork）** | tool-summary 单测：各工具合成、explicit 透传、脱敏、相对路径 vs 文件名。 |
| `src/remote-approval/broker.js` | 修改（fork） | 新增 `requiresExplicitSummary(client)` + per-provider skip：`payload.summarySource==='synthesized'` 且 provider 要求显式摘要 → 跳过。 |
| `test/remote-approval-broker.test.js` | 修改（fork） | 新增 per-provider withhold 测试；既有测试不变仍通过。 |
| `src/remote-approval/providers/telegram-provider.js` | 修改（fork） | `capabilities.requiresExplicitSummary = true`（保行为不变）。 |
| `src/remote-approval/providers/feishu-provider.js` | 修改（fork） | 显式 `requiresExplicitSummary: false`（自文档化；缺省即 false）。 |
| `src/permission.js` | **最小接入（上游）** | 顶部加一行 `require`；`buildRemoteApprovalPayload` 改用 `buildToolApprovalSummary` 并 stamp `payload.summarySource`。`maybeStartRemoteApproval` 不变。 |
| `test/permission-telegram-approval.test.js` | 修改（fork） | 新增 describe "permission feishu tool coverage (v4)"；既有 telegram 测试不改仍通过。 |
| `src/feishu-approval-settings.js` | 修改（fork） | `DEFAULT_FEISHU_APPROVAL.elicitationEnabled: false → true`。 |
| `test/feishu-approval-settings.test.js` | 修改（fork） | 更新默认值断言（off→on）；coercion/validate 断言不变。 |
| `CLAUDE.md` | 已修改（fork） | 已写入 Fork 维护规范（本任务首步，已完成）。 |
| `docs/Expand_function/feishu/feishu-remote-approval-v4-*-log.md` | 新增（fork） | 实施日志（任务末撰写）。 |

**接入点（上游 permission.js）仅 2 处**：① 顶部 `require`；② `buildRemoteApprovalPayload` 函数体。其余逻辑全在 `src/remote-approval/`。

---

## Task 1：tool-summary 模块（工具感知安全摘要）

**Files:**
- Create: `src/remote-approval/tool-summary.js`
- Test: `test/tool-summary.test.js`

**Interfaces:**
- Produces:
  - `buildToolApprovalSummary(permEntry, { explicitSummary?, cwd?, redact?, maxLen? }) -> { text: string, source: "explicit" | "synthesized" }`
  - `synthesize(permEntry, cwd) -> string`（内部，导出供测试）
  - `displayPath(filePath, cwd) -> string`、`hostOf(url) -> string`、`mcpToolLabel(toolName) -> string|null`（导出供测试）

- [ ] **Step 1: 写失败测试** `test/tool-summary.test.js`

```javascript
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/tool-summary.test.js`
Expected: FAIL（`Cannot find module '../src/remote-approval/tool-summary'`）

- [ ] **Step 3: 实现** `src/remote-approval/tool-summary.js`

```javascript
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/tool-summary.test.js`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/remote-approval/tool-summary.js test/tool-summary.test.js
git commit -m "feat(feishu): add tool-aware safe approval summary builder"
```

---

## Task 2：broker per-provider 摘要门槛（withhold synthesized）

**Files:**
- Modify: `src/remote-approval/broker.js`
- Test: `test/remote-approval-broker.test.js`

**Interfaces:**
- Consumes: `payload.summarySource`（由 Task 3 的 permission.js stamp；`"explicit"` / `"synthesized"` / `undefined`）。
- Produces: `requiresExplicitSummary(client) -> boolean`（导出，镜像现有 `supportsRichApproval`）。skip 行为：provider 要求显式摘要 + payload 为 `synthesized` → 不计入 fanout（不增加 `providerCount`）。

- [ ] **Step 1: 写失败测试**（追加到 `test/remote-approval-broker.test.js` 末尾）

```javascript
test("withholds synthesized summaries from providers that require an explicit one", () => {
  const strict = {
    ...makeClient("telegram", Promise.resolve(null)),
    capabilities: { requiresExplicitSummary: true },
  };
  const lenient = makeClient("feishu", Promise.resolve(null));

  const handle = startRemoteApprovalFanout({
    clients: [strict, lenient],
    payload: { title: "x", detail: "y", summarySource: "synthesized" },
    normalizeDecision: normalize,
    onDecision: () => {},
  });

  assert.equal(strict.calls.length, 0);   // Telegram withheld
  assert.equal(lenient.calls.length, 1);  // Feishu still sent
  assert.equal(handle.providerCount, 1);
  assert.equal(handle.started, true);
});

test("explicit summaries go to all providers including strict ones", () => {
  const strict = {
    ...makeClient("telegram", Promise.resolve(null)),
    capabilities: { requiresExplicitSummary: true },
  };
  const lenient = makeClient("feishu", Promise.resolve(null));

  startRemoteApprovalFanout({
    clients: [strict, lenient],
    payload: { title: "x", detail: "y", summarySource: "explicit" },
    normalizeDecision: normalize,
    onDecision: () => {},
  });

  assert.equal(strict.calls.length, 1);
  assert.equal(lenient.calls.length, 1);
});

test("a strict-only fanout with a synthesized summary reports not started", () => {
  const strict = {
    ...makeClient("telegram", Promise.resolve(null)),
    capabilities: { requiresExplicitSummary: true },
  };
  const handle = startRemoteApprovalFanout({
    clients: [strict],
    payload: { title: "x", detail: "y", summarySource: "synthesized" },
    normalizeDecision: normalize,
    onDecision: () => { throw new Error("must not run"); },
  });
  assert.equal(handle.started, false);
  assert.equal(handle.providerCount, 0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/remote-approval-broker.test.js`
Expected: FAIL（strict.calls.length 为 1，未被 withhold）

- [ ] **Step 3: 实现**（修改 `src/remote-approval/broker.js`）

3a. 在 `supportsRichApproval` 之后新增 helper：

```javascript
// v4 (Feishu all-tools coverage): a provider can require an explicit,
// agent-supplied action summary. When set, the broker withholds payloads whose
// summary was synthesized by Clawd (summarySource === "synthesized"). Telegram
// keeps its conservative "no card without a real description" behavior; Feishu
// (which does not set this) receives synthesized summaries too.
function requiresExplicitSummary(client) {
  if (!client || typeof client !== "object") return false;
  if (client.requiresExplicitSummary === true) return true;
  return !!(client.capabilities && client.capabilities.requiresExplicitSummary === true);
}
```

3b. 在 `startRemoteApprovalFanout` 的 `list.forEach` 循环里，紧接 `if (!isClientEnabled(client)) return;` 之后插入：

```javascript
    const id = providerId(client, index);
    if (payload && payload.summarySource === "synthesized" && requiresExplicitSummary(client)) {
      safeLog(`${id} skipped: provider requires an explicit action summary`);
      return;
    }
```

> 注意：原循环里 `const id = providerId(client, index);` 在 `if (!isClientEnabled)` 之后已存在；将其与上面的 skip 合并（不要重复声明 `id`）。

3c. 在 `module.exports` 增加 `requiresExplicitSummary`。

- [ ] **Step 4: 跑测试确认通过（含既有用例回归）**

Run: `node --test test/remote-approval-broker.test.js`
Expected: PASS（新 3 条 + 既有全部；既有用例 payload 无 `summarySource` → 不触发 skip）

- [ ] **Step 5: Commit**

```bash
git add src/remote-approval/broker.js test/remote-approval-broker.test.js
git commit -m "feat(feishu): broker withholds synthesized summaries from strict providers"
```

---

## Task 3：provider 能力标记 + permission.js 最小接入 + 集成测试

**Files:**
- Modify: `src/remote-approval/providers/telegram-provider.js`
- Modify: `src/remote-approval/providers/feishu-provider.js`
- Modify: `src/permission.js`（顶部 require + `buildRemoteApprovalPayload`）
- Test: `test/permission-telegram-approval.test.js`（新增 describe）

**Interfaces:**
- Consumes: `buildToolApprovalSummary`（Task 1）、`requiresExplicitSummary` 行为（Task 2）。
- Produces: `buildRemoteApprovalPayload` 返回的 payload 多一个内部字段 `summarySource`；`maybeStartRemoteApproval` 不变（已把 `payload` 透传给 fanout）。

- [ ] **Step 1: provider 能力标记**

`src/remote-approval/providers/telegram-provider.js` — `capabilities` 改为：
```javascript
    capabilities: { supportsRichApproval: true, requiresExplicitSummary: true },
```
`src/remote-approval/providers/feishu-provider.js` — `capabilities` 改为（自文档化，缺省即 false）：
```javascript
    capabilities: { supportsRichApproval: true, requiresExplicitSummary: false },
```

- [ ] **Step 2: 写失败集成测试**（追加新 describe 到 `test/permission-telegram-approval.test.js`）

```javascript
describe("permission feishu tool coverage (v4)", () => {
  // Feishu-like (lenient) and Telegram-like (strict) clients exposed via
  // ctx.getRemoteApprovalClients, mirroring main.getRemoteApprovalClients().
  function makeClients() {
    const feishu = {
      id: "feishu",
      calls: [],
      capabilities: { supportsRichApproval: true, requiresExplicitSummary: false },
      isEnabled: () => true,
      requestApproval(payload) { this.calls.push(payload); return new Promise(() => {}); },
    };
    const telegram = {
      id: "telegram",
      calls: [],
      capabilities: { supportsRichApproval: true, requiresExplicitSummary: true },
      isEnabled: () => true,
      requestApproval(payload) { this.calls.push(payload); return new Promise(() => {}); },
    };
    return { feishu, telegram };
  }

  it("sends a synthesized Feishu card for an Edit with no description", () => {
    const { feishu } = makeClients();
    const perm = initPermission(makeCtx({ getRemoteApprovalClients: () => [feishu] }));
    const entry = makePermEntry({
      toolName: "Edit",
      toolInput: { file_path: "D:\\work\\project-alpha\\src\\auth.js", old_string: "a", new_string: "b" },
    });
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    assert.equal(feishu.calls.length, 1);
    assert.match(feishu.calls[0].detail, /Tool: Edit/);
    assert.match(feishu.calls[0].detail, /Summary: Edit/);
    assert.equal(feishu.calls[0].summarySource, "synthesized");
    // never leaks file body
    assert.equal(feishu.calls[0].detail.includes("new_string"), false);
  });

  it("withholds the synthesized Edit card from Telegram but sends it to Feishu", () => {
    const { feishu, telegram } = makeClients();
    const perm = initPermission(makeCtx({ getRemoteApprovalClients: () => [telegram, feishu] }));
    const entry = makePermEntry({
      toolName: "Edit",
      toolInput: { file_path: "D:\\work\\project-alpha\\src\\auth.js" },
    });
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    assert.equal(feishu.calls.length, 1);
    assert.equal(telegram.calls.length, 0);
  });

  it("still sends an explicit-description tool to both channels", () => {
    const { feishu, telegram } = makeClients();
    const perm = initPermission(makeCtx({ getRemoteApprovalClients: () => [telegram, feishu] }));
    const entry = makePermEntry({ toolName: "Bash", toolInput: { command: "ls", description: "List files" } });
    perm.pendingPermissions.push(entry);

    assert.equal(perm.maybeStartRemoteApproval(entry), true);
    assert.equal(feishu.calls.length, 1);
    assert.equal(telegram.calls.length, 1);
    assert.equal(feishu.calls[0].summarySource, "explicit");
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test test/permission-telegram-approval.test.js`
Expected: FAIL（`summarySource` 为 undefined；Edit 无 description 时旧逻辑返回 false → feishu.calls.length 为 0）

- [ ] **Step 4: 实现 permission.js 最小接入**

4a. 顶部（紧邻第 8 行 `require("./remote-approval/broker")`）新增：
```javascript
const { buildToolApprovalSummary } = require("./remote-approval/tool-summary");
```

4b. 替换 `buildRemoteApprovalPayload`（约 940–967 行）为：
```javascript
function buildRemoteApprovalPayload(permEntry) {
  const session = ctx.sessions.get(permEntry.sessionId);
  const cwd = (session && session.cwd) || permEntry.cwd || "";
  // fork (Feishu all-tools coverage): if the agent supplied a description/
  // summary/reason use it (source "explicit"); otherwise synthesize a safe,
  // tool-aware summary (source "synthesized"). The broker withholds synthesized
  // summaries from providers that require an explicit one (Telegram), so this
  // broadens Feishu coverage WITHOUT changing Telegram behavior.
  const explicitSummary = buildRemoteApprovalSummary(permEntry);
  const { text: summary, source: summarySource } = buildToolApprovalSummary(permEntry, {
    explicitSummary,
    cwd,
    redact: compactRemoteApprovalText,
  });
  if (!summary) return null;
  const agentId = compactRemoteApprovalText(permEntry.agentId || "claude-code", 80) || "claude-code";
  const toolName = compactRemoteApprovalText(permEntry.toolName || "Unknown", 80) || "Unknown";
  const sessionFolder = compactRemoteApprovalText(basenameForDisplay(cwd), 80);
  const detail = [
    `Agent: ${agentId}`,
    `Tool: ${toolName}`,
    sessionFolder ? `Folder: ${sessionFolder}` : null,
    `Summary: ${summary}`,
  ].filter(Boolean).join("\n");
  const suggestionButtons = buildRemoteSuggestionButtons(permEntry);
  const payload = {
    title: `${agentId} requests ${toolName}`,
    detail,
    summarySource,
  };
  if (suggestionButtons.length > 0) payload.suggestions = suggestionButtons;
  return payload;
}
```

> 说明：`buildRemoteApprovalSummary`（上游函数）保留并仍被调用（explicit 分支），仅其"为空即整体放弃"的副作用被 fork 兜底取代。`maybeStartRemoteApproval` 已把 `payload` 透传给 fanout（约 1075–1077 行），无需改动；broker 自 `payload.summarySource` 读取。

- [ ] **Step 5: 跑测试确认通过（含既有 telegram 用例回归）**

Run: `node --test test/permission-telegram-approval.test.js`
Expected: PASS。关键回归：
- `:138`（有 description）→ `explicit` → Telegram 仍发 → `true`，detail 含 `Summary: Run project tests`、不含命令/token。
- `:438`（无 description，仅 Telegram 在 fanout）→ `synthesized` → Telegram withhold → `started=false` → `maybeStartRemoteApproval===false`（**不改该测试**）。

- [ ] **Step 6: Commit**

```bash
git add src/remote-approval/providers/telegram-provider.js src/remote-approval/providers/feishu-provider.js src/permission.js test/permission-telegram-approval.test.js
git commit -m "feat(feishu): route all-tool approvals to Feishu via synthesized summaries (Telegram unchanged)"
```

---

## Task 4：AskUserQuestion 默认进飞书（elicitation 默认开启）

**Files:**
- Modify: `src/feishu-approval-settings.js`
- Test: `test/feishu-approval-settings.test.js`

**Interfaces:** `DEFAULT_FEISHU_APPROVAL.elicitationEnabled: true`。仅影响飞书 elicitation 通道（`getRemoteElicitationClients` 只返回飞书），不碰 Telegram。

- [ ] **Step 1: 改默认值断言（先红）** — 修改 `test/feishu-approval-settings.test.js:61-62`：

```javascript
test("normalizeFeishuApproval defaults elicitationEnabled ON and coerces booleans", () => {
  assert.equal(settings.normalizeFeishuApproval({}).elicitationEnabled, true);
  assert.equal(settings.normalizeFeishuApproval({ elicitationEnabled: false }).elicitationEnabled, false);
  assert.equal(settings.normalizeFeishuApproval({ elicitationEnabled: "yes" }).elicitationEnabled, true);
});
```

> 第 3 行从 `"yes" → false` 改为 `"yes" → true`：非布尔值落回默认；新默认为 true。（保持 coercion 语义：仅显式 `boolean` 覆盖默认。）

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/feishu-approval-settings.test.js`
Expected: FAIL（当前默认 false）

- [ ] **Step 3: 实现** — `src/feishu-approval-settings.js:17`：

```javascript
  // v4: answer AskUserQuestion in Feishu (default on; Feishu-only, set via Settings).
  elicitationEnabled: true,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/feishu-approval-settings.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/feishu-approval-settings.js test/feishu-approval-settings.test.js
git commit -m "feat(feishu): default AskUserQuestion-to-Feishu (elicitation) on"
```

---

## Task 5：全量回归 + 真机走查清单 + 实施日志 + 推送

**Files:**
- Create: `docs/Expand_function/feishu/feishu-remote-approval-v4-all-tools-coverage-log.md`

- [ ] **Step 1: 全量自动化回归**

Run: `node test/run-tests.js`（需要 `node_modules`；若缺，先 `npm install`）
若全量受 Electron 依赖影响，至少跑相关子集：
```bash
node --test test/tool-summary.test.js test/remote-approval-broker.test.js test/remote-approval-provider-registry.test.js test/permission-telegram-approval.test.js test/feishu-approval-settings.test.js test/feishu-approval-main-wiring.test.js test/feishu-card-builder.test.js
```
Expected: PASS, 0 fail。

- [ ] **Step 2: 撰写实施日志**（`feishu-remote-approval-v4-all-tools-coverage-log.md`）

记录：根因证据、改动文件清单与 commit、各任务红→绿摘要、最终测试计数、合并友好性核对（上游仅 permission.js 两处接入 + 既有 telegram 测试未改仍过）、残余手动验证项。

- [ ] **Step 3: 真机走查清单（用户执行，本机不可自动化）**

> AGENTS.md 要求 `/permission` 改动须用真实 Claude Code + 真实飞书账号验证。本环境无飞书凭据、无法驱动 Electron+飞书，故由用户按下表走查；我在日志中如实标注"自动化通过、真机待验"。

1. 设置：飞书审批已配置（App 凭据 + receive_id + allowed approver）且 enabled；"Answer AskUserQuestion in Feishu" 开关为 ON（**存量用户需手动确认一次**：旧默认 off 可能已被持久化）。
2. 触发并核对飞书是否各收到一张卡：`Edit`、`Write`、`Read`（若被审批）、`Grep`、一个 MCP 工具、`Bash`（带/不带 description）、`AskUserQuestion`。
3. 飞书点 Allow/Deny/选项 → 桌面气泡随之消解；桌面先处理 → 飞书卡显示"已在桌面/终端处理"。
4. （仅飞书）确认 Telegram 行为不变：若同时配置 Telegram，`Edit`（无 description）不应发 Telegram，只发飞书；`Bash`（带 description）两边都发。
5. 摘要不含文件内容/diff/密钥（人工抽查卡片文本）。

- [ ] **Step 4: 推送 + PR**

```bash
git add docs/Expand_function/feishu/feishu-remote-approval-v4-all-tools-coverage-log.md
git commit -m "docs(feishu): v4 all-tools coverage implementation log + walkthrough"
git push -u origin fix/feishu-approval-coverage
```
PR 目标分支：`feature/health-reminder`（fork 集成分支）。

---

## 风险与回滚

- **影响面外溢到 Codex/Qwen/CodeBuddy**：这些 agent 也走 `startRemoteApproval`，修复后它们的无 description 工具也会发**飞书**（Telegram 仍不发）。属期望内（"agent 都能到飞书"），且飞书未配置时无副作用。
- **存量用户 elicitation 持久化为 false**：默认翻转只惠及新装/未存该键用户；存量用户在 Settings 开一次即可（走查清单第 1 点）。非阻断、非本计划新引入。
- **摘要泄漏**：所有 synthesized 文本经 `compactRemoteApprovalText` 脱敏 + 长度上限；只含动作+目标，单测覆盖脱敏注入。
- **回滚**：每任务独立 commit；如需回退仅还原对应 commit。上游接入点集中（permission.js 两处），还原成本低。

## 合并友好性核对（对照 CLAUDE.md 规范）

- 新增优先：核心逻辑在新文件 `src/remote-approval/tool-summary.js`。
- 上游最小接入：`src/permission.js` 仅 1 行 require + 1 个函数体；加注释标注 fork 来源。
- 上游文档/测试干净：`AGENTS.md` 未改；既有 telegram 测试**未改**仍通过；fork 行为用新测试/新 describe 覆盖。
- 默认与影响面：仅放宽飞书，Telegram capability 显式声明、行为不变。
- 差异下沉到 capability：`requiresExplicitSummary` 表达 provider 差异，无共享路径 if/else。

---

## Self-Review

- **Spec coverage**：① 全工具进飞书 → Task 1+2+3；② AskUserQuestion 进飞书 → Task 4（+既有 elicitation 通道）；③ Telegram 不变 → Task 2/3 的 capability + 既有测试回归；④ 合并友好 → 文件结构 + permission.js 最小接入 + CLAUDE.md。
- **Placeholder scan**：无 TODO/TBD；每步含完整代码与命令、预期输出。
- **Type consistency**：`buildToolApprovalSummary -> {text, source}`；`payload.summarySource ∈ {"explicit","synthesized"}`；broker 读 `payload.summarySource` + `requiresExplicitSummary(client)`；命名跨任务一致。
- **既有测试不破**：broker 既有用例 payload 无 `summarySource`（不触发 skip）；telegram `:138`/`:438` 经 capability+synthesized 推演仍过（已在 Task 3 Step 5 标注）。
