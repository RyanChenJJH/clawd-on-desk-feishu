# 飞书远程审批 v3 任务计划（分阶段 · TDD）

> 状态：**待评审**（未动工）。配套方案：[feishu-remote-approval-v3-development-plan.md](feishu-remote-approval-v3-development-plan.md)。
> 日期：2026-06-17
> 原则：先测后码；每阶段跑全量飞书用例保持绿；**安全不变量（G2）优先落地**。

---

## 阶段 V3-P1：先锁安全不变量 + 超时对齐（修 Expired 第一步）

**目标**：飞书永不导致越权执行；超时可配且对齐 agent。

- [ ] 改 `test/remote-approval-broker.test.js`：断言 `normalizeDecision(null)` 后 broker **永不 settle**、不触发 `onDecision`。
- [ ] 改 `test/permission-*.test.js`：断言**飞书 resolve(null)（超时/中止）后本地权限保持挂起、绝不 allow**。
- [ ] `feishu-approval-settings.js`：新增 `approvalTimeoutSeconds`（默认 600，clamp [30,1800]）到 default/normalize/validate；保持未知键拒绝。
- [ ] 注入 runner `approvalTimeoutMs`（由配置换算），替代硬编码 90s。
- [ ] 改 `test/feishu-approval-settings.test.js` / `feishu-approval-runner.test.js`。

**涉及文件**：`src/feishu-approval-settings.js`、`src/feishu-approval-runner.js`、`src/feishu-approval-main.js`（接线）、对应测试
**验收**：安全回归绿；超时配置生效；现有用例不回归。

---

## 阶段 V3-P2：结局分型（消除 Expired 误解）

**目标**：超时 / 已在别处 / 被取代，分别如实显示。

- [ ] `feishu-card-builder.js`：`buildFeishuResolvedCard` 扩展 status 文案/配色 —— `timed_out` / `answered_elsewhere` / `superseded`（保留兼容旧 `expired`）。
- [ ] runner：`finishApproval` / `onAbort` 接受 **cause**；timer→`timed_out`，本地解决→`answered_elsewhere`，其他 provider→`superseded`。
- [ ] `broker.js` `settle/abort` 与 permission `cancelRemoteApproval` 传入 cause。
- [ ] 改 `test/feishu-card-builder.test.js` / `feishu-approval-runner.test.js`：各结局文案与触发路径。

**涉及文件**：`src/feishu-card-builder.js`、`src/feishu-approval-runner.js`、`src/remote-approval/broker.js`、`src/permission.js`、对应测试
**验收**：方案 §8 第 3、4 条满足；不同结局文案正确。

---

## 阶段 V3-P3：飞书答题——卡片与决策形态

**目标**：问题卡渲染 + `answer` 决策契约。

- [ ] `feishu-card-builder.js`：`buildFeishuQuestionCard({nonce,questions})`；callback 编码/解析 `clawd:elicit:<nonce>:<qIdx>:<optIdx>`。
- [ ] `broker.js` 与 permission `normalizeDecision`：新增 `{action:"answer", answers}`。
- [ ] 改 `test/feishu-card-builder.test.js`、`test/remote-approval-broker.test.js`：卡片渲染、解析、`answer` 透传。

**涉及文件**：`src/feishu-card-builder.js`、`src/remote-approval/broker.js`、`src/permission.js`、对应测试
**验收**：问题卡可构建可解析；`answer` 决策流通。

---

## 阶段 V3-P4：飞书答题——Runner 与文本回复

**目标**：选项点击 / 文本回复任一回答。

- [ ] runner 新增 `requestElicitation(payload, options)`：发问题卡、登记 pending、选项 action 或关联文本回复 resolve、resolve 后更新卡为「已回答：<答案>」。
- [ ] 扩展 `handleMessage`：把审批人对问题卡的**文本回复**关联到挂起 elicitation（`replyTo→nonce` 或最近挂起）。
- [ ] 复用 `isAllowedApprover`；答案长度封顶。
- [ ] 改 `test/feishu-approval-runner.test.js`：选项 resolve、文本 resolve、非授权拒绝、超时 null。

**涉及文件**：`src/feishu-approval-runner.js`、对应测试
**验收**：飞书选项/文本两路均能回答；安全校验生效。

---

## 阶段 V3-P5：接线 permission ↔ 远程 elicitation

**目标**：AskUserQuestion 真正走到飞书并回填 Claude。

- [ ] `feishu-approval-settings.js`：新增 `elicitationEnabled`（默认 false）到 default/normalize/validate。
- [ ] permission：新增 `maybeStartRemoteElicitation(permEntry)`，在 elicitation 展示且开关开启时调用；远程 `answer`→`{type:"elicitation-submit",answers}`→resolve allow。
- [ ] `feishu-approval-main.js` / `remote-approval` 注册表：暴露 elicitation 能力（与 `requestApproval` 平行）。
- [ ] 改 `test/permission-*.test.js`、`test/feishu-approval-main*.test.js`、`test/feishu-approval-settings.test.js`。

**涉及文件**：`src/permission.js`、`src/feishu-approval-main.js`、`src/remote-approval/*`、`src/feishu-approval-settings.js`、对应测试
**验收**：方案 §8 第 1、2 条满足；默认关时行为与现状一致。

---

## 阶段 V3-P6：设置 UI + i18n（**必做 — 否则功能不可用**）

> ⚠️ **修正（v3.1）**：此项曾被推迟，导致用户**无法在 UI 启用飞书答题、无法改超时**。现为**硬需求**。

- [ ] 飞书设置 UI 新增「在飞书回答 Claude 提问」开关（`elicitationEnabled`）、「审批等待超时（秒）」输入（`approvalTimeoutSeconds`）。
- [ ] i18n 文案（zh / zh-TW / en / ja / ko）。
- [ ] 对应设置测试 + 校验。

**涉及文件**：飞书设置 tab、`src/settings-i18n.js`、`src/settings-actions.js`、对应测试
**验收**：**运行 app** 中能看到并使用这两个控件；保存即时生效；开启后 AskUserQuestion 真能进飞书答题。

---

## 阶段 V3-P7：确诊并修复本地自动放行（**先诊后修，必须给结论**）

**目标**：定位并消除「工具被自动执行（还没点飞书就跑了）」的真实放行来源——不是"只加日志"就算完。

- [ ] 在每个本地 resolve 处补**结构化「解决来源」日志**（桌面点击 / 全局快捷键 / 另一 provider / 连接关闭 / TUI）。
- [ ] **真实复现**并锁定路径（必做，不能停在"已加日志"）。
- [ ] 据结论**实施对症修复**（如全局放行快捷键护栏、连接关闭回退语义/标签修正）。
- [ ] （可选，待用户定）「远程挂起时抑制本地自动放行」开关，使飞书成为该请求的权威闸门。

**涉及文件**：`src/permission.js`（日志 + 修复）、视确诊结论而定
**验收**：在真实复现中**明确指出放行来源并完成修复或给出明确结论**；不再出现"未操作即执行 + Expired"。

---

## 阶段 V3-P8：回归、**端到端运行验证**、文档、上游清单

- [ ] 跑全量飞书用例（v1+v2+v3）保持绿。
- [ ] **端到端运行验证（必做）**：真机/真账号开启飞书审批 + 答题，走查方案 §8 第 1–7 条（设置开关可用、AskUserQuestion 进飞书、选项/文本两路回答、超时不早退、结局正确、超时不放行、越权已修），留痕。
- [ ] 写/补 v3 实施日志 `feishu-remote-approval-v3-log.md`（含运行验证结论）。
- [ ] 更新 [upstream-merge-checklist.md](upstream-merge-checklist.md)：远程 elicitation、超时配置、结局分型、安全不变量回归项。

**验收**：方案 §8 全部 9 条达成并留痕；文档可回溯；清单含 v3 项。

---

## 阶段 V3.2：去掉审批超时（卡片常驻直到用户点）+ 去幽灵卡

> 用户反馈：① 不需要"审批等待超时"设置；审批发到飞书后没点就**一直保持**，直到用户在飞书或电脑上点击（桌面 Allow 弹窗本就一直等）。② 只有真正需要用户确认的审批才发飞书（**所有 agent 都发**，不限 Claude/Codex），去掉"幽灵卡片"。
> 这部分**推翻 V3 早期/V3.1 的可配置超时**（当时为修"90s 早退"而加；现改为根本不超时）。

### V3.2-P2A：移除飞书审批超时，卡片寿命 = 本地待决条目寿命（必做）
- [ ] **RED**：改 `test/feishu-approval-runner.test.js`——「resolves null on timeout」类用例改为断言**不存在自发超时**（无 timer 注入时不会自行 finishApproval/expire）；仍保留 abort（本地解决/连接断开）能正常 resolve。
- [ ] **GREEN**：`feishu-approval-runner.js` 删除内部 `approvalTimeoutMs` 计时器与 `getEffectiveApprovalTimeoutMs`；pending 仅由"卡片动作 / 关联文本回复 / abort（signal）"三条路径结束。
- [ ] 删除 `feishu-approval-settings.js` 的 `approvalTimeoutSeconds`（default/normalize/validate/导出）及相关测试。
- [ ] 删除设置 UI 的「审批等待超时（秒）」输入（`settings-tab-telegram-approval.js` `buildFeishuTimeoutRow` + 接入 + `currentFeishuConfig`/`next` 字段）与 `FEISHU_V3_SETTINGS_COPY` 中的 timeout 文案；同步 `settings-renderer-browser-env.test.js` 保存 payload 断言。
- **不动核心 hook 安装器**（守"不影响扩展外功能"）：飞书卡片寿命随本地待决条目；桌面 Allow 弹窗本就常驻（用户确认），故飞书随之常驻。若真机发现本地条目在 agent hook 上限（现 600s）被回收，再单独、显式决定是否调核心 hook（属扩展外，需另行批准）。
- **验收**：发审批到飞书后长时间不操作，卡片不自行变 Expired；在飞书点 / 在桌面点都能正确结束并同步另一端。

### V3.2-P2B：只发"真正等用户"的审批，去幽灵卡（必做）
- [ ] 核查并固化：`maybeStartRemoteApproval` 已跳过 auto-approve / 已解决条目；确保**不对会被本地自动放行/无需用户的请求发卡**。
- [ ] 所有 agent 的可执行审批都发飞书（不加 agent 限制）——核对 `isRemoteApprovalActionable` 现状，确认未把用户在用的 agent 误排除；如有用户需要的 agent 被排除，按需放开（仅在确属"需用户确认审批"时）。
- [ ] 卡片被桌面/终端解决时干净更新为 `answered_elsewhere`（V3-P2 已具），不残留、不显示 Expired。
- [ ] **RED→GREEN**：`test/remote-approval-broker.test.js` / `permission-*.test.js` 补断言——自动放行/已解决的请求不触发远程发卡；本地解决后远程卡进入 answered_elsewhere、永不 allow 本地（安全不变量保持）。
- **验收**：不再出现"我没点就自动了/Expired"的幽灵卡；真正需要我的审批才在飞书出现并常驻。

### V3.2-P2C：回归 + 运行验证（必做）
- [ ] 全量飞书 + 渲染 env 测试绿（含被删超时相关断言的同步）。
- [ ] 真机：发一个审批 → 飞书出现卡 → 放置数分钟不动 → 卡仍在（不 Expired）→ 桌面点 Allow → 飞书卡同步为"已在别处处理"；再发一个 → 飞书点 → 桌面同步。结论写入日志。

### V3.2 涉及文件
`src/feishu-approval-runner.js`、`src/feishu-approval-settings.js`、`src/feishu-approval-main.js`（去掉超时注入）、`src/settings-tab-telegram-approval.js`、`src/settings-i18n.js`、`src/permission.js`（仅核查/必要时放开 agent 排除）、对应 `test/*`

---

## 涉及文件总览

| 类别 | 文件 |
| --- | --- |
| 新增 | `docs/.../feishu-remote-approval-v3-log.md` |
| 改动 | `src/feishu-card-builder.js`、`src/feishu-approval-runner.js`、`src/feishu-approval-settings.js`、`src/feishu-approval-main.js`、`src/remote-approval/broker.js`、`src/remote-approval/*`(注册表)、`src/permission.js`、飞书设置 tab、`src/settings-i18n.js`、`src/settings-actions.js`、相应 `test/*` |

> 建议提交顺序：**P1（安全/超时）→ P2（结局分型）** 先行（直接缓解用户痛点），再 **P3→P4→P5→P6（答题）**，最后 **P7（确诊）→P8（收尾）**。
