# 飞书远程审批 v3 开发方案：飞书答题（AskUserQuestion）+ 修复 Expired/越权执行

> 状态：**方案待评审**（未动工）。
> 日期：2026-06-17
> 关联问题：①「Claude 让我做选择/决定的提问没有进飞书」；②「飞书卡片还没点，工具就自动执行了，随后卡片显示 Expired」。
> 前置：基于 v1+v2 已实施代码（见 `feishu/` 目录现有日志）。

---

## 0. 需求澄清结论（已与用户确认）

| 项 | 结论 |
| --- | --- |
| 飞书答题覆盖范围 | **仅 `AskUserQuestion`**（含其「选项按钮 + 最后一项手动文本输入」形态）。ExitPlanMode / 通用 elicitation 暂不纳入。 |
| Expired 现象 | **工具真的执行了**（不是仅卡片变灰）——即在用户点飞书之前，本地侧已被「放行并执行」，飞书随后被中止并标成 Expired。 |

---

## 1. 目标

1. **G1 飞书答题**：把 `AskUserQuestion` 推送到飞书，**每个选项渲染为按钮**；**最后一项/"其他"走文本回复手动输入**；用户在飞书选择或回复即可回答 Claude，答案回填 Claude Code。默认关闭、可配置、上游合并友好。
2. **G2 杜绝「飞书侧导致的越权执行」**：从不变量上保证——**飞书审批超时/未响应绝不会让本地工具被放行执行**。
3. **G3 消除 Expired 误解**：把单一「Expired」拆分为可区分的结局（超时 / 已在别处处理 / 被其他通道取代），卡片如实显示，杜绝「莫名其妙过期」。
4. **G4 等待窗口对齐**：飞书审批超时**可配置**，默认与 agent 的 hook 超时对齐，消除「agent 还在等、飞书先过期」。

---

## 2. 根因分析（从源头，非打补丁）

### 2.1 提问不进飞书（G1）
- 源头在 [`permission.js:896-908 isRemoteApprovalActionable()`](../../../src/permission.js#L896)：
  ```js
  if (permEntry.isElicitation || ...) return false;             // 排除 elicitation
  if (permEntry.toolName === "ExitPlanMode"
      || permEntry.toolName === "AskUserQuestion") return false; // 显式排除提问
  ```
  `AskUserQuestion` 被**显式排除**，从设计上不会进入远程审批 fanout。这不是 bug——v1/v2 的远程审批只支持 **allow / deny / suggestion(index)** 三态，**没有"答题"通道**。
- 决策契约也不够：远程决定经 [`broker.js`](../../../src/remote-approval/broker.js) 的 `normalizeDecision` 只认 allow/deny/suggestion；`suggestion` 仅携带一个扁平 `index`，**承载不了「多问题 / 多选项 + 自由文本」**。
- 本地答题契约**已存在且可复用**：[`permission.js:1570`](../../../src/permission.js#L1570) 接受 `{ type:"elicitation-submit", answers:{[问题文本]:答案} }`，经 [`buildElicitationUpdatedInput`](../../../src/permission.js#L364) 回填 → resolve allow。飞书答题只需**产出同样的 answers 形态**。
- **结论**：新建一条**独立的「远程 elicitation」链路**（不要塞进 allow/deny 的 fanout），新增 `answer` 决策形态，复用既有 elicitation 回填契约。

### 2.2 Expired / 越权执行（G2、G3、G4）
- 「Expired」灰卡来自 [`feishu-card-builder.js:172 buildFeishuResolvedCard(status:"expired")`](../../../src/feishu-card-builder.js#L172)；在 [`feishu-approval-runner.js`](../../../src/feishu-approval-runner.js) 仅 3 处触发 `finishApproval(id, null, "expired")`：
  1. **90s 超时**（`DEFAULT_APPROVAL_TIMEOUT_MS = 90000`，[:16](../../../src/feishu-approval-runner.js#L16)）；
  2. **signal abort**（本地先解决 / 另一 provider 先决定，[:626](../../../src/feishu-approval-runner.js#L626)）；
  3. 发送失败。
- **时间窗严重错配**：
  - Claude Code 的 `PermissionRequest` 是 **HTTP 阻塞 hook，timeout = 600s**（[`hooks/install.js:709`](../../../hooks/install.js#L709)）。
  - 本地保持连接的等待约 **590s**（[`hooks/server-config.js:357`](../../../hooks/server-config.js#L357)）。
  - **飞书却在 90s 就放弃**。于是 agent 还在等、飞书卡先变 Expired —— G4 的直接来源。
- **单一标签掩盖多种结局**：超时、已在桌面/终端处理、被其他 provider 取代、发送失败——**全标成「Expired」**，用户自然觉得"莫名其妙过期/还没点就没了"。
- **关于「工具真的执行了」**：飞书 90s 超时只会 `resolve(null)` → `normalizeDecision(null)=null` → broker **不 settle** → **本地权限保持挂起、工具不会执行**。所以"工具被执行"**不可能由飞书超时造成**，必然是**本地侧先放行了**（候选：桌面气泡被点 / 全局放行快捷键被误触 / 另一远程通道决定 / CC 自身 TUI 抢答）。本地一旦 allow，`cancelRemoteApproval → abort` 飞书 → 卡变 Expired。
  - **这正是 G2 的安全要点**：飞书必须**永不**成为「未经用户远程确认就放行」的原因；而本地为何会自动 allow，需要**定位具体放行路径**后对症修复（见 §3 Part 2 第 4 点），不可盲目打补丁。

---

## 3. 设计

### Part 1 — 飞书答题（G1，新增、默认关）

1. **路由（独立链路）**：`AskUserQuestion` 在 [`server-route-permission.js:1027`](../../../src/server-route-permission.js#L1027) 作为本地 elicitation 气泡（`isElicitation:true`）。新增 `maybeStartRemoteElicitation(permEntry)`，在 elicitation 条目展示时触发，受新配置 `feishuApproval.elicitationEnabled`（默认 false）+ provider 能力位 gate。**不改动** allow/deny 的 `isRemoteApprovalActionable` 排除逻辑（二者解耦）。
2. **卡片模型**：`feishu-card-builder.js` 新增 `buildFeishuQuestionCard({ nonce, questions })`：
   - 单问题（最常见）：问题文本 + 每个选项一颗按钮；callback 编码 `clawd:elicit:<nonce>:<qIdx>:<optIdx>`；附提示「回复本消息可手动输入（其他）」。
   - 多问题：每问一段 + 各自选项按钮；逐问收集答案，全部作答后 finalize。
   - 自由文本「其他/手动输入」：用户**回复卡片消息**→ 在 `handleMessage` 关联到挂起的 elicitation（按 `replyTo→nonce`，或该审批人最近一条挂起 elicitation）→ 作为该问题答案。本期文本输入**优先覆盖单问题场景**；多问题以按钮为主（如实记录此范围）。
3. **决策形态（新增）**：`broker.js` 与 permission 侧的 `normalizeDecision` 增加 `answer`：`{ action:"answer", answers:{[问题文本]:答案} }`。permission 侧映射为 `{ type:"elicitation-submit", answers }`（复用既有契约）→ resolve allow。
4. **Runner**：`feishu-approval-runner.js` 新增 `requestElicitation(payload, options)`：发问题卡、登记 pending（复用现有 timeout/abort/updateCard 基础设施），在「选项 card action」或「关联文本回复」任一到达时 resolve；resolve 后把卡片更新为「已回答：<答案>」。
5. **接线**：`feishu-approval-main.js` / `remote-approval` 注册表把 runner 的 elicitation 能力暴露给 permission 层（与 `requestApproval` 平行）；permission 在 elicitation 展示且开关开启时调用。
6. **安全**：复用审批人 allow-list（`isAllowedApprover`）——选项点击与文本回复都必须来自允许的审批人；答案长度封顶；不回显敏感。

### Part 2 — 修复 Expired / 越权（G2、G3、G4）

1. **等待窗口对齐（G4）**：飞书审批超时**配置化**。`feishu-approval-settings.js` 新增 `approvalTimeoutSeconds`（默认对齐 agent hook 的 **600s**，clamp `[30,1800]`），注入 runner 的 `approvalTimeoutMs`。消除「agent 在等、飞书先过期」。
2. **结局分型（G3）**：把单一 `"expired"` 拆为 runner 内已天然分流的不同代码路径，赋予不同标签/文案：
   - `timed_out`（`entry.timer` 触发）→「已超时（agent 可能已自行处理）」。
   - `answered_elsewhere`（`entry.onAbort` 因本地解决而触发）→「已在桌面或终端处理」。
   - `superseded`（`entry.onAbort` 因其他 provider 先决定）→「已由其他通道处理」。
   - 实现：abort 时携带 **cause**（broker `settle/abort` 与 permission `cancelRemoteApproval` 传入原因），`onAbort` 据 cause 选文案；`buildFeishuResolvedCard` 扩展 status 文案/配色集。
3. **安全不变量（G2，最重要）**：固化并加回归测试——**飞书 `requestApproval` 解析为 `null`（超时/中止/发送失败）时，broker 永不 settle、本地权限永不被 allow**。确保「未经远程确认绝不放行」。
4. **定位本地自动放行路径（先确诊后修，非盲补）**：用户确认工具确被执行，而飞书超时不可能造成执行 → 必为本地放行。新增**带「解决来源」的结构化日志**（桌面点击 / 全局快捷键 / 另一 provider / 连接关闭 / TUI），在下次复现时锁定路径：
   - 若为**全局放行快捷键误触**（`syncPermissionShortcuts` 注册的全局 allow/deny）→ 评估加焦点/确认护栏。
   - 若为**连接关闭→本地 deny→agent 回退 TUI 后被放行** → 修正回退语义与标签。
   - （可选产品方向，待用户定）「远程审批挂起时抑制本地自动放行」开关，让飞书成为该请求的权威闸门。本期先确诊 + 标签如实，不默认改放行权威性。

---

## 4. 数据模型变更

`feishuApproval`（[feishu-approval-settings.js](../../../src/feishu-approval-settings.js)，注意其 `validateFeishuApproval` 对未知键**严格拒绝**，需同步更新默认/normalize/validate）：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `elicitationEnabled` | boolean | `false` | 是否把 AskUserQuestion 推送到飞书答题（默认关） |
| `approvalTimeoutSeconds` | number | `600` | 审批等待超时（秒），clamp `[30,1800]`，对齐 agent hook |

---

## 5. 模块边界与上游合并友好

- 新增/改动集中在 `src/feishu-*`、`src/remote-approval/*`、卡片构建与设置；对 [`permission.js`](../../../src/permission.js) 的侵入**最小且隔离**：新增 `maybeStartRemoteElicitation` + 给 `cancelRemoteApproval` 增加 cause 参数；对 [`broker.js`](../../../src/remote-approval/broker.js) 仅加 `answer` 动作与 abort cause。
- 默认行为不变：`elicitationEnabled` 默认关；超时默认值变化属**修复**（且可配置）。
- 更新 [upstream-merge-checklist.md](upstream-merge-checklist.md)。

---

## 6. 测试策略（TDD）

| 测试文件 | 覆盖 |
| --- | --- |
| 改 `test/feishu-card-builder.test.js` | 问题卡（多问/多选项）渲染；`clawd:elicit:<nonce>:<q>:<o>` 解析；resolved 卡新增 `timed_out`/`answered_elsewhere`/`superseded` 文案 |
| 改 `test/feishu-approval-runner.test.js` | `requestElicitation`：选项点击 resolve；关联文本回复 resolve；非授权审批人拒绝；超时 resolve null；abort cause→标签 |
| 改 `test/remote-approval-broker.test.js` | `answer` 动作透传；`null` 决策**永不 settle**（安全不变量回归） |
| 改 `test/permission-*.test.js` | elicitation 条目在开关开启时启动远程 elicitation；远程 `answer`→`elicitation-submit`；**飞书超时/中止永不放行本地**（G2 回归） |
| 改 `test/feishu-approval-settings.test.js` | `elicitationEnabled`/`approvalTimeoutSeconds` 默认/归一化/校验；未知键仍被拒 |

---

## 7. 风险与权衡

- **R1 多问题 + 自由文本的关联**：文本回复对应"哪一问"在多问题下有歧义；本期文本输入聚焦单问题，多问题以按钮为主，文档标注。
- **R2 超时拉长到 600s**：挂起期更长，pending 卡更久；以「结局分型 + 状态命令可查」缓解，且本就对齐 agent。
- **R3 安全**：远程文本回复是新输入面 → 严格 allow-list + 长度封顶 + 不回显敏感。
- **R4 越权根因待确诊**：§3 Part2-4 是「先确诊再修」，不在本方案预设具体补丁；确诊后可能追加一个小修复任务。

---

## 8. 验收标准

> ⚠️ **修正（v3.1）**：核心链路（卡片/runner/回填/超时/状态分型）已建，但**设置页开关与超时输入被推迟**，导致用户**无法在 UI 启用飞书答题、无法改超时**——功能等于不可用。设置 UI 与运行验证为**必做**。

1. **设置页可配（必做，必验）**：飞书设置页有「在飞书回答 Claude 提问」开关（`elicitationEnabled`）与「审批等待超时（秒）」输入（`approvalTimeoutSeconds`），保存后即时生效。
2. 开启后，`AskUserQuestion` 在飞书显示为**带选项按钮的卡片**；点击选项即回答 Claude；**回复文本**可走「其他/手动输入」；答案在卡片上如实回显并回填 Claude Code。
3. 多收件人 + 审批人 allow-list 对答题同样生效。
4. agent 仍在等待期间，飞书卡**不再**提前变 Expired（超时已对齐/可配置）。
5. 当请求**在别处被解决**，卡片显示「已在桌面/终端处理」等**正确结局**，而非「Expired」。
6. **飞书审批超时/中止绝不导致本地工具被执行**（G2 回归用例绿）。
7. **越权根因确诊（必做）**：通过结构化日志在真实复现中锁定"还没点就执行"的本地放行路径，并给出对症修复或明确结论（不是仅加日志）。
8. 现有飞书 v1+v2 用例全绿。
9. **端到端运行验证（必做）**：实际开启飞书审批 + 答题，在真机/真账号走查第 1–7 条并留痕。

---

## 9. 落地顺序

见配套任务计划：[feishu-remote-approval-v3-stage-plan.md](feishu-remote-approval-v3-stage-plan.md)。

---

## 10. V3.2 补充：去掉审批超时（卡片常驻直到用户点）+ 去幽灵卡

**用户诉求**：
1. **不需要"审批等待超时"设置**。审批发到飞书后若不点击，应**一直保持**，直到用户**在飞书点**或**在电脑点**。依据：桌面端 CC 的 Allow 弹窗本就一直等用户选择，飞书应与之一致。
2. **只发"真正需要用户确认"的审批**到飞书（**所有 agent 都发**，不限 Claude/Codex），去掉"还没点就自动了/Expired"的**幽灵卡片**。

**与既有设计的关系**：这推翻 V3 早期 + V3.1 的"可配置审批超时"（当时为修"飞书 90s 早退"而加）。现在的正确模型不是"调长超时"，而是"**飞书卡片没有自己的超时**，其寿命 = 本地待决审批条目的寿命"。

**根因/设计（从源头）**：
- 飞书 runner 现有一个内部审批计时器（`approvalTimeoutMs`，V3.1 默认 600s）。**删除它**：pending 只由三条真实路径结束——① 飞书卡片动作；② 关联文本回复；③ abort（本地/桌面/终端解决，或 agent 连接断开）。无任何自发过期。
- 同步**删除** `approvalTimeoutSeconds` 配置（schema/normalize/validate）与 V3.1 加的设置项 + i18n + 浏览器 env 测试里的相关断言。
- **不改核心 hook 安装器**（守"不影响 Expand_function 以外功能"）：桌面待决条目常驻 → 飞书卡随之常驻。若真机发现本地条目在 agent 自身 hook 上限（现 600s）被回收（即桌面也并非真·无限等），那是核心层问题，**单独显式评估**是否调 hook，不在本方案默认范围。
- **去幽灵卡**：飞书只对"真正在等用户"的审批发卡（`maybeStartRemoteApproval` 已跳过 auto-approve / 已解决条目——固化并加测）；被桌面/终端解决时卡片干净更新为 `answered_elsewhere`（V3-P2 已具），不残留、不显示 Expired。去掉飞书超时后，`timed_out` 自发态消失，结局只剩 allowed / denied / answered_elsewhere / superseded。
- **安全不变量保持**（V3-P1）：飞书侧任何结束都不会放行本地工具；本地永远独立决定。

**验收**：
1. 审批发到飞书后长时间不操作，卡片**不自行 Expired**；飞书点 / 桌面点都能正确结束并同步另一端。
2. 不再出现"未操作即自动/Expired"的幽灵卡；只有真正需要用户的审批才在飞书出现。
3. 所有 agent 的需确认审批都能进飞书。
4. 全量飞书 + 渲染 env 测试绿；真机走查留痕。

任务分解见 [stage-plan 阶段 V3.2](feishu-remote-approval-v3-stage-plan.md)。
