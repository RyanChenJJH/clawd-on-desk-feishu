# Feishu 远程审批 v4 — 全工具覆盖 实施日志

**分支**：`fix/feishu-approval-coverage`（基于 `feature/health-reminder` = 2ebb9c4，PR 目标 `feature/health-reminder`）
**计划**：见 `feishu-remote-approval-v4-all-tools-coverage-plan.md`
**方法**：systematic-debugging（先根因）→ brainstorming（拍板）→ writing-plans → executing-plans + TDD（红→绿→提交，小步）

---

## 1. 根因（已用代码 + 既有测试佐证）

实测"Claude 的一些审批没发到飞书，但电脑界面正常提示"。

- **主根因**：`src/permission.js` 的 `buildRemoteApprovalSummary()` 只在 `tool_input` 含 `description`/`summary`/`reason` 时返回摘要，否则 `null` → `buildRemoteApprovalPayload()` 返回 `null` → `maybeStartRemoteApproval()` `return false`，**静默不发**。桌面气泡 `showPermissionBubble()` 无条件渲染完整 `tool_input`，所以桌面恒显示。
  - 能到飞书：`Bash`/`Task`（自带 description）；被丢弃：`Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`Read`/`Glob`/`Grep`/`WebFetch`/多数 MCP。
  - 佐证：`test/permission-telegram-approval.test.js:438`「无 description/summary/reason 时 `maybeStartRemoteApproval===false`」。这是当初为 **Telegram**（第三方 bot，避免把原始 tool_input/密钥外发）做的安全设计，飞书 provider 复用同一 payload 路径而继承了它。
- **次根因**：AskUserQuestion 走独立 elicitation 通道，受 `feishuApproval.elicitationEnabled` 控制，默认 `false`（`src/feishu-approval-settings.js:17`）。
- **第三（设计如此，未改）**：`ExitPlanMode` 计划审阅被显式排除，仅桌面出现。

**根因修复（非打补丁）**：把"是否发远程"的判定从全局 payload 层下沉到 **per-provider 能力层**——任意工具都合成安全摘要，由 provider 能力 `requiresExplicitSummary` 决定是否接收合成摘要。Telegram 行为因此一字不变，飞书获得全覆盖。

## 2. 决策（用户拍板）

- 范围：工具审批 + AskUserQuestion 都进飞书。
- 影响面：仅放宽飞书，Telegram 不变。
- R1：`elicitationEnabled` 默认 `true`。
- R2：合成摘要的文件目标用"相对 cwd 路径，取不到则文件名"，**绝不含文件内容/diff/密钥**。

## 3. 改动与提交（小步 TDD）

| Commit | 内容 | 测试 |
|--------|------|------|
| `45037f2` | `CLAUDE.md` 写入 Fork 上游合并规范（用户要求"先"） | — |
| `b5b85c2` | 设计 + 阶段计划文档 | — |
| `1e42362` | **Task1** 新增 `src/remote-approval/tool-summary.js`（工具感知安全摘要，纯函数 + 注入式脱敏） | `test/tool-summary.test.js` 8/8 |
| `bd2b690` | **Task2** `broker.js` 新增 `requiresExplicitSummary`，对 `summarySource==='synthesized'` 的严格 provider withhold | `test/remote-approval-broker.test.js` 14/14（含既有 11） |
| `3d377ba` | **Task3** telegram provider `requiresExplicitSummary:true`、feishu `:false`；`permission.js` `buildRemoteApprovalPayload` 改用 `buildToolApprovalSummary` 并 stamp `summarySource`（接入仅 1 require + 1 函数体） | `test/permission-telegram-approval.test.js` 21/21（既有 438/138 未改仍过） |
| `6785d60` | **Task4** `feishu-approval-settings.js` `elicitationEnabled` 默认 `true`；同步 fork 的默认值断言（settings + prefs 测试） | `feishu-approval-settings` 14/14；`prefs`+`settings-renderer` 277/277 |

接入点（上游 `src/permission.js`）：仅顶部 1 行 `require` + `buildRemoteApprovalPayload` 函数体，均加注释标注 fork 来源。其余逻辑全在 `src/remote-approval/`。

## 4. 验证

- **改动区域全绿**：tool-summary 8、broker 14、permission-telegram 21、feishu-approval-settings 14、prefs+settings-renderer 277 —— 全部 pass/0 fail。
- **关键回归（Telegram 不变）**：
  - `:438`（无 description，Telegram-only）→ 合成摘要被 withhold → `maybeStartRemoteApproval===false`、未发卡。**测试未改仍过**。
  - `:138`（有 description）→ `explicit` → Telegram 仍发、摘要脱敏、不含命令/token。**测试未改仍过**。
- **全量** `node test/run-tests.js`：**4435 tests / 4420 pass / 2 fail / 13 skipped**。
  - 2 个 fail 与本改动**无关**、为环境/既有问题，已证明：
    - `git diff feature/health-reminder --name-only` 仅含 feishu/permission/broker/settings 文件，**无** roam/hermes/installation。
    - `agent-installation-detector`「bare Hermes home → low-confidence」实测 `actual:'high'`：该检测读取**本机真实 home 目录**，本机存在 Hermes 残留 → 与代码无关。
    - `roam`「switches to roam visual state」在并行大跑下偶发（伴随 Windows Git Bash `fork: Resource temporarily unavailable`），**单独跑通过**。

## 5. 合并友好性核对（对照 CLAUDE.md 规范）

- 新增优先：核心在新文件 `src/remote-approval/tool-summary.js`。
- 上游最小接入：`src/permission.js` 仅 1 `require` + 1 函数体（带 fork 注释）。
- 上游文档/测试干净：`AGENTS.md` 未改；既有 Telegram 测试 `:138`/`:438` **未改**仍过；其余改的是 fork 自己的默认值断言（feishuApproval 字段）。
- 默认与影响面：仅放宽飞书；Telegram capability 显式声明、行为不变。
- 差异下沉到 capability：`requiresExplicitSummary` 表达 provider 差异，无共享路径 if/else。

## 6. 真机走查清单（需用户在真实 Claude Code + 真实飞书账号执行）

> AGENTS.md 要求 `/permission` 改动须真机验证；本环境无飞书凭据、无法驱动 Electron+飞书。以下由用户走查，本日志如实标注"**自动化通过、真机待验**"。

1. **存量用户注意**：旧默认 `elicitationEnabled=false` 可能已被持久化到本机 prefs。请在 Settings → Feishu 审批，确认「Answer AskUserQuestion in Feishu」开关为 **ON**（默认翻转只惠及新装/未存该键用户）。
2. 飞书审批已配置（App 凭据 + receive_id + allowed approver）且 enabled。
3. 逐一触发并核对飞书各收到一张卡：`Edit`、`Write`、`Read`（若被审批）、`Grep`、一个 MCP 工具、`Bash`（带/不带 description）、`AskUserQuestion`。
4. 飞书点 Allow/Deny/选项 → 桌面气泡随之消解；桌面先处理 → 飞书卡显示"已在桌面/终端处理"。
5. 若同时配置 Telegram：`Edit`（无 description）只发飞书、不发 Telegram；`Bash`（带 description）两边都发。
6. 人工抽查卡片文本：摘要只含"动作 + 目标"，**不含**文件内容/diff/密钥。

## 7. 残余 / 后续

- 真机走查（上节）。
- 可选后续：为存量用户做一次 `elicitationEnabled` 迁移（把历史持久化的 `false` 视为"未显式设置"以应用新默认）——本次未做，避免覆盖用户显式选择；通过 Settings 开关即可。
- `ExitPlanMode` 计划审阅仍仅桌面（设计如此，范围外）。
- Copilot 仍不接 remote approval（需 Copilot 专用安全摘要格式，既有 follow-up）。
