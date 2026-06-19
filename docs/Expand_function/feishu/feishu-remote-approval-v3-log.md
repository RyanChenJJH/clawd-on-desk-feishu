# 飞书远程审批 v3 实施日志（TDD）

> 配套方案：[feishu-remote-approval-v3-development-plan.md](feishu-remote-approval-v3-development-plan.md)
> 任务计划：[feishu-remote-approval-v3-stage-plan.md](feishu-remote-approval-v3-stage-plan.md)
> 分支：`feature/health-reminder`（v1+v2 未提交工作之上继续）
> 测试运行：`node --test test/<file>.test.js`（Node 内置 test runner）

---

## V3-P1：安全不变量 + 可配置超时 ✅（2026-06-17）

**目标**：① 飞书审批超时**绝不**导致本地工具被放行（锁安全不变量）；② 审批等待窗口可配置并对齐 agent 的 600s hook 超时，替换硬编码 90s。

### TDD 过程
1. **基线**：`feishu-approval-settings/runner` + `remote-approval-broker` 共 36 用例全绿。
2. **RED（配置字段）**：在 `test/feishu-approval-settings.test.js` 新增对 `approvalTimeoutSeconds`（默认 600、clamp [30,1800]、四舍五入、非数字回退）与 `elicitationEnabled`（默认 false、布尔强制）的断言，并更新既有「完整 shape」deepEqual。运行 → 5 失败（字段缺失），符合预期。
3. **GREEN（配置字段）**：`src/feishu-approval-settings.js`
   - 新增常量 `APPROVAL_TIMEOUT_DEFAULT/MIN/MAX_SECONDS = 600/30/1800` 与纯函数 `normalizeApprovalTimeoutSeconds()`。
   - `DEFAULT_FEISHU_APPROVAL` 增加 `elicitationEnabled:false`、`approvalTimeoutSeconds:600`。
   - `normalizeFeishuApproval`（defaults 段 + value 覆盖段）归一化两字段。
   - `validateFeishuApproval`：把两键加入允许列表；`approvalTimeoutSeconds` 必须为 [30,1800] 的整数、`elicitationEnabled` 必须布尔。
   - 导出常量与 `normalizeApprovalTimeoutSeconds`。
   - 修正一处测试期望笔误（`Math.round(120.7)=121`）。→ 14/14 绿。
4. **RED（运行时超时）**：在 `test/feishu-approval-runner.test.js` 新增 3 个用例断言 `getEffectiveApprovalTimeoutMs()`：未显式注入时取配置秒数×1000；配置缺省回退 600s；显式 `approvalTimeoutMs` 优先。运行 → 3 失败（方法不存在）。
5. **GREEN（运行时超时）**：`src/feishu-approval-runner.js`
   - 构造参数 `approvalTimeoutMs` 默认由 `DEFAULT_APPROVAL_TIMEOUT_MS` 改为 `null`。
   - 新增 `effectiveApprovalTimeoutMs()`：显式注入优先，否则 `currentConfig().approvalTimeoutSeconds*1000`，再退回常量。
   - `requestApproval` 的超时定时器改用 `effectiveApprovalTimeoutMs()`。
   - 返回对象暴露 `getEffectiveApprovalTimeoutMs`（兼作 /status 诊断）。→ 22/22 绿。
6. **安全不变量回归锁**：在 `test/remote-approval-broker.test.js` 新增两用例：
   - 「provider 解析 null（飞书超时/中止）→ broker 永不 settle」。
   - 「另一 provider 已 deny 后迟到的 null 不覆盖决定」。
   - **证伪验证**（TDD 精神）：临时把 broker 改成 `normalizeDecision(decision) || {action:"allow"}`，运行 → 第一个安全用例如期**失败**；随即还原。证明该测试确实守护不变量。
7. **配置 shape 回归**：`test/prefs.test.js` 两处 `feishuApproval` 全量 deepEqual 补上新字段。

### 关键决策
- **「显式注入优先于配置」**：测试用 `approvalTimeoutMs` 注入毫秒级快超时；生产（`feishu-approval-main.js` / `main.js`）**不传**该参数 → 走配置（默认 600s）。验证 `main.js:1896` 未传，故硬编码 90s 实质下线。
- `elicitationEnabled` 字段在本阶段一并落地（仅配置，默认关、不激活任何行为），避免 P5 再次改动 shape 造成第二次 deepEqual churn。
- 安全不变量测试虽对既有行为「立即通过」，但通过**临时证伪**确认其守护力，符合「看着它失败」的要求。

### 影响文件
- 改：`src/feishu-approval-settings.js`、`src/feishu-approval-runner.js`
- 测试：`test/feishu-approval-settings.test.js`、`test/feishu-approval-runner.test.js`、`test/remote-approval-broker.test.js`、`test/prefs.test.js`

### 验收
- P1 相关 + shape 依赖套件合计 **334/334 绿**（含 settings/runner/broker/main/wiring/prefs/settings-actions）。
- 安全不变量：飞书 `null`（超时/中止/发送失败）→ broker 不 settle → 本地权限保持挂起，**飞书不可能放行本地工具**。
- 等待窗口默认 600s、可配 [30,1800]、对齐 agent hook。

### 延后/后续
- 飞书设置 UI 的「超时秒数」输入与 i18n → V3-P6。
- 「已在别处处理 vs 超时」的卡片结局分型 → V3-P2。

---

## V3-P2：结局分型（消除 Expired 误解）✅（2026-06-17）

**目标**：把单一 "expired" 灰卡拆为 `timed_out` / `answered_elsewhere` / `superseded`，让卡片如实显示「为何结束」，不再把「已在桌面/终端处理」「被其他通道取代」都误标为 Expired。

### TDD 过程
1. **RED（卡片）**：`test/feishu-card-builder.test.js` 断言 `buildFeishuResolvedCard` 对三种新 status 渲染不同文案，且保留 `expired` 旧值兼容、均无按钮。→ 失败。
2. **GREEN（卡片）**：`src/feishu-card-builder.js` 引入 `RESOLVED_STATUS` 映射：`allowed/green`、`denied/red`、`timed_out`(「Timed out — no response in time」/grey)、`answered_elsewhere`(「Resolved on desktop or terminal」/grey)、`superseded`(「Resolved via another channel」/grey)、`expired`(兼容/grey)。→ 绿（修正一处文案/断言不一致：timed_out 用「Timed out」而非「Expired」）。
3. **RED（runner）**：断言超时→卡片含「timed out」；`controller.abort("answered_elsewhere"|"superseded")`→卡片含对应文案。→ 超时用例失败。
4. **GREEN（runner）**：`src/feishu-approval-runner.js` 新增纯函数 `abortCauseStatus(signal)`（读 `signal.reason`：`superseded` 否则 `answered_elsewhere`）；超时定时器 `finishApproval(...,"timed_out")`；`onAbort` 用 `abortCauseStatus`。→ 绿。
   - 排错：超时用例最初查不到 updateCard——根因是测试用了 3 字符 nonce「nto」，`safeNonce` 要求 4–64 字符，`buildFeishuApprovalCard` 抛错→`requestApproval` 早返回 null 未发送。改 nonce 为「ntout」并在断言前 `await tick()` 确保 messageId 先记录。
5. **RED→GREEN（broker）**：`test/remote-approval-broker.test.js` 断言「settle 时其他 provider 的 signal.reason='superseded'」「handle.abort(reason) 透传 reason」。实现：`broker.js` `abort(reason)` 把 reason 传给各 `controller.abort(reason)`；`settle()` 调 `abort("superseded")`。
6. **RED→GREEN（permission 接线）**：`test/permission-telegram-approval.test.js` 在既有「本地先解决 / deny-and-focus」两用例补断言 `signal.reason==="answered_elsewhere"`；实现：`permission.js cancelRemoteApproval` 改为 `controller.abort("answered_elsewhere")`。

### 关键决策
- **cause 经 `AbortSignal.reason` 传递**：`controller.abort(reason)` → provider `signal.reason` → runner 选卡片文案。无识别 reason 的 abort 默认 `answered_elsewhere`（「在飞书之外被解决」比「Expired」更准确）。
- 发送失败 / 运行时 stop 的清理仍用既有 `expired`（卡片多半根本没渲染，无需细分）。

### 影响文件
- 改：`src/feishu-card-builder.js`、`src/feishu-approval-runner.js`、`src/remote-approval/broker.js`、`src/permission.js`
- 测试：`test/feishu-card-builder.test.js`、`test/feishu-approval-runner.test.js`、`test/remote-approval-broker.test.js`、`test/permission-telegram-approval.test.js`

### 验收
- P2 相关套件 **112/112 绿**（permission-telegram-approval / runner / broker / card-builder / server-route-permission）。
- 用户在飞书将看到：超时=「Timed out」、桌面/终端已答=「Resolved on desktop or terminal」、其他通道=「Resolved via another channel」，不再混为「Expired」。

---

## V3-P3：问题卡片 + elicit 回调（飞书答题地基）✅（2026-06-17）

**目标**：构建 AskUserQuestion 的飞书卡片——每个选项一颗按钮 + 文本回复提示；提供 elicit 回调编解码。

### TDD 过程
1. **RED**：`test/feishu-card-builder.test.js` 新增 4 用例：`buildFeishuQuestionCard` 单问题每选项一钮、多问题各自 optionIndex、`elicitCallbackValue` 校验 + `parseFeishuElicitAction` 往返、忽略 approval/status 动作。→ 4 失败。
2. **GREEN**：`src/feishu-card-builder.js`
   - 常量 `ELICIT_CALLBACK_TYPE="clawd.elicit"`、`ELICIT_CALLBACK_RE`、`MAX_QUESTIONS/OPTIONS/TEXT`。
   - `elicitCallbackValue(nonce,qIdx,optIdx)`（复用 `safeNonce`，整数校验）。
   - `optionLabel()`（兼容字符串/`{label|text|value}`）、`questionOptionRows()`（两钮一行，**optionIndex 保留原始下标**，跳过空 label 不移位）、`buildFeishuQuestionCard()`（每问题标题 + 选项钮 + 「💬 Reply to this message to type a custom answer.」提示）。
   - `parseElicitPayload()` + `parseFeishuElicitAction()`（对象/字符串两种回调形态；与 approval/status 互斥）。
   - 导出新函数。→ 13/13 绿。

### 关键决策
- **`{action:"answer", answers}` 决策归一化推迟到 V3-P5**（在 permission 真正消费处实现自定义 normalizeDecision），避免本阶段对 broker `decision.js` 做投机改动。P3 聚焦纯卡片/解析，单测充分。
- optionIndex 用**原始数组下标**而非渲染后位置，保证 runner 用 (qIdx,optIdx) 取回正确选项 label。

### 影响文件
- 改：`src/feishu-card-builder.js`；测试：`test/feishu-card-builder.test.js`

### 验收
- 卡片构建 **13/13 绿**；问题卡含选项钮（elicit 回调）+ 文本回复提示；解析器与 approval/status 互不串扰。

---

## V3-P4：Runner requestElicitation + 文本回复 ✅（2026-06-17）

**目标**：runner 能发问题卡、并在「选项点击」或「自由文本回复」任一到达时解析为答案，超时/中止解析为 null。

### TDD 过程
1. **RED**：`test/feishu-approval-runner.test.js` 新增 3 用例：选项点击→`{action:"answer",answers:{[问题]:label}}`、文本回复→自定义答案、未授权审批人点击被忽略（→超时 null）。→ 失败（`requestElicitation` 不存在）。
2. **GREEN**：`src/feishu-approval-runner.js`
   - import 增加 `buildFeishuQuestionCard`、`parseFeishuElicitAction`。
   - 新增独立 `pendingElicitations` Map（与 `pendingApprovals` 解耦，allow/deny 生命周期不受影响）。
   - 新增机制：`optionLabelOf`、`buildAnswersByText`、`safeUpdateElicitationCard`、`finishElicitation`、`clearAllElicitations`、`nextUnansweredQuestionIndex`、`recordElicitationAnswer`（全部问题作答后 finalize，卡片更新为 `answered` 并附答案摘要）、`handleElicitCardAction`（审批人校验 + optionIndex→label）、`handleElicitationTextReply`（最近一条该审批人挂起 elicitation 的下一个未答问题）。
   - `handleCardAction` 在 status 之后、approval 之前插入 elicit 路由；`handleMessage` 对非命令消息尝试文本答复。
   - `requestElicitation(payload,options)` 镜像 `requestApproval`：发问题卡、登记、超时/中止→null（复用 `effectiveApprovalTimeoutMs`/`abortCauseStatus`）、发送失败处理。
   - `stop()` 增 `clearAllElicitations()`；`getStatus` 增 `pendingElicitationCount`；导出 `requestElicitation`、`_pendingElicitations`。
   - 卡片侧新增 `answered`(green) resolved 状态。→ 27/27 runner 绿。

### 关键决策
- **答案形态** `{action:"answer", answers:{[questionText]:label}}`：直接匹配本地 `buildElicitationUpdatedInput` 的 answers（按问题文本键），P5 permission 侧零转换。
- **多问题**：逐问累计，全部作答才 finalize；文本回复填「下一个未答问题」（单问题最常见）。文本回复关联策略 = 该审批人**最近一条**挂起 elicitation（无父消息 id 时的务实取舍，已在方案 R1 标注）。
- 未授权审批人的选项点击/文本被忽略（同 approval 的 allow-list）。

### 影响文件
- 改：`src/feishu-approval-runner.js`、`src/feishu-card-builder.js`（answered 状态）
- 测试：`test/feishu-approval-runner.test.js`

### 验收
- Feishu runner/card/broker/main/wiring **58/58 绿**；飞书选项点击与文本回复两路均能产出答案；超时/未授权安全回退。

---

## V3-P5：permission ↔ 远程 elicitation 接线 ✅（2026-06-17）

**目标**：AskUserQuestion 端到端进入飞书并回填 Claude（opt-in，默认关）。

### TDD 过程
1. **RED**：`test/permission-telegram-approval.test.js` 新增 describe「feishu remote elicitation (v3)」3 用例：客户端答题→entry 以 allow + `resolvedUpdatedInput.answers` 解析；非 elicitation/非 AskUserQuestion/空问题不启动；本地先解决→signal abort 且 reason `answered_elsewhere`。→ 失败（`maybeStartRemoteElicitation` 不存在）。
2. **GREEN（permission 层）**：`src/permission.js`
   - `getRemoteElicitationClients()`（读 `ctx.getRemoteElicitationClients`）、`isRemoteElicitationActionable()`（仅 `isElicitation` + AskUserQuestion/clarify + 非 headless + 有问题）、`buildRemoteElicitationPayload()`（问题+选项 label 提取）。
   - `maybeStartRemoteElicitation()`：把 elicitation 客户端**适配进 `startRemoteApprovalFanout`**（`requestApproval→requestElicitation`，`supportsRichApproval:true` 让 `answer` 决策不被过滤），自定义 `normalizeAnswer` 只认 `{action:"answer",answers}`；onDecision 经既有 `buildElicitationUpdatedInput` → `resolvePermissionEntry(allow)`；handle 存入 `remoteApprovalAbortController`（复用 cancelRemoteApproval 的 abort+cause）。
   - 导出 `maybeStartRemoteElicitation`。→ permission 16/16 绿。
3. **GREEN（应用接线）**：
   - `src/feishu-approval-main.js getClient()` 暴露 `requestElicitation`（委托 runner）。
   - `src/main.js` 新增 `getRemoteElicitationClients()`（仅当 `feishuApproval.elicitationEnabled===true` 返回飞书客户端）；注入 permission ctx 的 `getRemoteElicitationClients`；route ctx 与解构补 `maybeStartRemoteElicitation`。
   - `src/server-route-permission.js` 新增 `startRemoteElicitation()`，在 AskUserQuestion 分支 `showPermissionBubble` 成功后调用（本地仍权威，先答者中止另一方）。

### 关键决策
- **复用 allow/deny 的 fanout** 而非新建并行扇出：以「客户端适配器（requestApproval→requestElicitation）+ 自定义 normalizeDecision」接入，最大化复用 abort/settle/cause 机制，permission 侵入最小。
- **gate 在 main.js**（读 prefs `elicitationEnabled`）：默认关，关时 `getRemoteElicitationClients` 返回空 → `maybeStartRemoteElicitation` 直接 false，行为与现状一致。

### 影响文件
- 改：`src/permission.js`、`src/feishu-approval-main.js`、`src/main.js`、`src/server-route-permission.js`
- 测试：`test/permission-telegram-approval.test.js`

### 验收
- P5 相关套件 **129/129 绿**；`node --check` 全部源文件语法 OK。
- 开启 `elicitationEnabled` 后 AskUserQuestion 进入飞书；本地/飞书先答者胜出，另一方收到 `answered_elsewhere`/`superseded` 卡片。

---

## V3-P7：本地自动放行的可观测性（先诊）✅（部分）（2026-06-17）

**目标**：为「飞书还没点工具就执行了」装上诊断探针，下次复现即可锁定真实放行路径。

### 已做
- `src/permission.js resolvePermissionEntry` 入口新增**结构化「解决来源」日志**：`resolve source: tool=… behavior=… reason=… remotePending=yes|no`。
  - `reason` 区分 `Client disconnected`（agent 断开）/ `local-ui`（桌面点击或全局快捷键）/ 其他显式 message。
  - `remotePending` 标记解决时是否还有在途远程审批/elicitation 卡（=yes 即「本地抢先于飞书」）。
- 验证：`permission-telegram-approval` + `server-route-permission` **71/71 绿**，日志不影响行为。

### 待用户复现确认（运行时，无法在本环境完成）
- 用户下次遇到「飞书未点而工具执行」时，按上面日志即可判定来源：
  - `reason=Client disconnected` → agent 等待中连接断开（CC hook 侧），按需调整回退语义；
  - `reason=local-ui` → 桌面气泡点击或**全局放行快捷键误触**（`syncPermissionShortcuts` 注册的 allow 快捷键）→ 评估护栏；
  - 另一 provider（Telegram）先决定 → 已由 P2 标为 `superseded`。
- **安全前提已锁**（P1）：无论哪条，本地放行**不可能由飞书超时/中止触发**。

---

## V3-P6 / V3-P8：状态checkpoint（2026-06-17）

> 说明：受单次会话推进容量限制，作了**模块优先级取舍**——飞书**核心**（P1 超时/安全、P2 结局分型、P3 问题卡、P4 runner 答题、P5 端到端接线、P7 诊断探针）已全部 TDD 落地并通过；将容量转向**用户首要诉求 Health_Reminder**（每日触发的几何/优先级缺陷），故飞书余项如下登记，便于续做。

### P8 全量回归（已做）
- `node test/run-tests.js`：**4220 用例，4207 通过，1 失败**。
- 唯一失败 = `agent installation detector › treats a bare Hermes home directory as low-confidence residue`（`actual:'high' expected:'low'`），**既有遗留失败**，与本次 feishu 改动无关（未触碰 `agent-installation-detector`，见 README 记录）。
- 结论：飞书 v3（P1–P5+P7）**对全量 4220 用例零回归**。

### P6 设置 UI（余项，未做）
- 配置字段 `elicitationEnabled` / `approvalTimeoutSeconds` 已在 `feishu-approval-settings.js` 落地（default/normalize/validate 全绿），**功能可经配置链路生效**；缺的是 `settings-tab-telegram-approval.js` 的两个可视控件（开关 + 秒数输入）+ `settings-i18n.js` 五语文案。属纯展示层，留作续做（不阻断核心）。

### 续做清单（飞书）
- [ ] P6：设置 UI 两控件 + 5 语 i18n。
- [ ] P7：用户运行时复现 → 据日志定位本地放行路径 → 对症（如全局快捷键护栏 / 断连回退语义）。
- [ ] 多收件人下 elicitation 文本回复关联的进一步加固（方案 R1）。

---

## ⚠️ V3.1 修正（2026-06-17，用户复核后）

**把 P6 设置 UI 当成"纯展示层/余项"是错误的取舍。** 没有设置页开关，用户**根本无法启用飞书答题、无法改超时**——核心链路再全也等于不可用。已在 [dev-plan §8](feishu-remote-approval-v3-development-plan.md) 与 [stage-plan P6/P7/P8](feishu-remote-approval-v3-stage-plan.md) 把以下**重新归类为硬需求（未完成）**：
- **P6 设置 UI（必做）**：`elicitationEnabled` 开关 + `approvalTimeoutSeconds` 秒数输入 + 5 语 i18n。
- **P7 越权（必做给结论）**：不能停在"已加诊断日志"，需真实复现锁定放行路径并对症修复。
- **P8 端到端运行验证（必做）**：真机/真账号开启飞书审批 + 答题逐条走查并留痕。

> 教训同 Health 模块：用户点名"可设置"的就是需求本体，不得作为展示层推迟。待用户批准 V3.1 后实施。

---

## ✅ V3.1 实施完成（2026-06-18，用户批准后 · TDD + Karpathy）

> 约束遵循：改动集中在飞书/远程审批模块与其设置接入点；i18n 用**独立 `FEISHU_V3_SETTINGS_COPY` 块**，便于组入上游时整体 lift-out。

### V3.1-P6 设置 UI ✅（必做项补齐）
- **配置层（已在 P1 落地并测试）**：`feishuApproval.elicitationEnabled`（默认 false）、`approvalTimeoutSeconds`（默认 600，clamp [30,1800]）—— default/normalize/validate 全绿。
- **UI（本次补齐）**：`settings-tab-telegram-approval.js` 飞书区新增两控件——「在飞书回答提问」开关（`buildFeishuElicitationRow`）+「审批等待超时（秒）」数字输入（`buildFeishuTimeoutRow`），插入到启用开关之后。
- **保存不丢字段（根因处理）**：`currentFeishuConfig()` 增读两字段；`{...cfg, override}` 的保存站点天然透传；显式 `next` 站点补上两字段——彻底避免"部分保存把新字段重置"的老问题（同既有 notifyOnComplete 注释所述坑）。
- **i18n**：`settings-i18n.js` 新增独立 `FEISHU_V3_SETTINGS_COPY`（5 语 keyset 对齐，zh/zh-TW 中文、其余英文），通过 i18n parity 测试。
- **测试维护**：`settings-renderer-browser-env.test.js` 的 4 处飞书保存 payload 断言补上两新字段（行为有意变更）。

### V3.1-P7 越权诊断 ✅（诊断到位）/ ⏳（修复待真机复现）
- 核查：`permission.js` `resolvePermissionEntry` 已有结构化「resolve source」日志（tool/behavior/reason/`remotePending`），可在下次复现时锁定"未点飞书即执行"的真实本地放行来源。
- 安全前提（P1 已锁 + 回归）：飞书超时/中止**永不**放行本地工具——故任何"自动执行"必来自本地路径，日志即可定位。
- ⏳ 对症修复需用户真机复现一次拿到日志来源后再做（先诊后修，不盲补）。

### V3.1 验证
- **全量回归**：`node test/run-tests.js` = **4234 / 4221 通过 / 1 既有无关失败**。→ 飞书 V3.1 **零回归**；i18n parity 绿。
- ⏳ 真账号端到端（开开关→AskUserQuestion 进飞书→选项/文本两路作答→超时不早退→结局文案）需用户在真机走查。

### 影响文件（V3.1）
`src/settings-tab-telegram-approval.js`、`src/settings-i18n.js`、`test/settings-renderer-browser-env.test.js`（配置/超时核心 P1 已落 `feishu-approval-settings.js` 等）

---

## ✅ V3.2 实施完成（2026-06-18，用户批准后 · TDD + Karpathy）

> 用户反馈：① 不要"审批等待超时"——发到飞书没点就**一直保持**，直到飞书或电脑上点（桌面 Allow 弹窗本就常驻）；② 只有真正需要用户确认的审批才发飞书，去掉"幽灵卡片"（我没点就自动了 / Expired）。
> 约束遵循：改动集中在飞书/远程审批模块；**不动核心 hook 安装器**；i18n 仍走独立 `FEISHU_V3_SETTINGS_COPY` 块便于上游 lift-out。

### V3.2-P2A 移除飞书审批超时（卡片寿命 = 本地待决条目寿命）✅
- **根因**：V3/V3.1 为修"90s 早退"加了可配置 `approvalTimeoutSeconds`，但这只是把早退时间调长——本质仍是"飞书会自行了结"。用户要的是**根本不自行了结**。故从源头删除超时，而非再调参数。
- **RED→GREEN（runner）**：`test/feishu-approval-runner.test.js`
  - 原「resolves null on timeout」用例改为 **persistence** 断言：注入 legacy `approvalTimeoutMs` 也**被忽略**，30ms 后审批仍 pending（`pendingApprovalCount===1`），随后卡片动作才 resolve。
  - 删除依赖自发超时的两个旧用例（real-approval 自超时打"timed out"标签、未授权点击"超时为 null"）；后者改写为**未授权点击被忽略→仍 pending→授权点击才 resolve**（不靠计时）。
- **GREEN（runner 实现）**：`feishu-approval-runner.js` 删除内部超时常量/`effectiveApprovalTimeoutMs`；真实审批/答题**无自发 timer**，仅由「卡片动作 / 关联文本回复 / abort(signal)」三条路径结束。唯一有界的是手动"发送测试卡"诊断（`testCardTimeoutMs`，构造参数，默认 90s），避免设置页测试卡空转。
- **配置/UI/i18n 全链路删字段**（从源头去掉，不留死配置）：
  - `feishu-approval-settings.js`：删 `approvalTimeoutSeconds` 的 default/normalize/validate/导出 + `normalizeApprovalTimeoutSeconds` + `APPROVAL_TIMEOUT_*` 常量；`elicitationEnabled` **保留**。
  - `feishu-approval-main.js`：删向 runner 注入 `approvalTimeoutMs` 的死参数。
  - `settings-tab-telegram-approval.js`：删「审批等待超时（秒）」输入行（`buildFeishuTimeoutRow` + 接入 + `currentFeishuConfig`/`next` 字段）。
  - `settings-i18n.js`：删 `FEISHU_V3_SETTINGS_COPY` 5 语的 `feishuApprovalTimeout`/`feishuApprovalTimeoutDesc`（保留答题文案，i18n parity 仍绿）。
  - 测试同步：`feishu-approval-settings.test.js`（改为断言字段已移除 + 作为未知键被拒）、`prefs.test.js`（2 处归一化期望对象）、`settings-renderer-browser-env.test.js`（4 处保存 payload 断言）。

### V3.2-P2B 只发"真正等用户"的审批、去幽灵卡、全 agent ✅（核查 + 固化）
- **核查结论（代码本就正确，固化为回归断言）**：
  - **幽灵卡防护已在源头**：`permission.js maybeStartRemoteApproval` 在条目已不在 `pendingPermissions`（被 auto-pilot/允许清单同步放行）时**直接返回 false 不发卡**；headless 会话镜像本地 auto-deny 不发卡；无 description/summary/reason 的裸输入不发卡。
  - **无 agent 白名单**：`isRemoteApprovalActionable` 不按 agentId 限制——CC / Codex / Qwen 及任意标准 held-connection agent 的 allow/deny 卡都发飞书（rich 建议按钮另由 `isRemoteRichApprovalSupported` 单独 gate，不影响普通审批卡）。
  - **被排除的 opencode / antigravity / copilot-cli 是对的**：它们用非标准应答传输（如 opencode 先 200-ACK 再处理），给它们发"可点的远程卡"反而决定回不去 = 新的幽灵卡。故**保持排除**，符合方案"仅在确属需用户确认审批时放开"。这是按根因取舍，不是漏排。
- **RED→GREEN（固化断言）**：`test/permission-telegram-approval.test.js`
  - 补 `isCopilotCli` 进"非可执行条目不发远程卡"清单（原缺）。
  - 新增「已解决条目（不在 pending）→ 不发卡（无幽灵卡）」。
  - 新增「任意标准 agent（claude-code/codex/qwen-code/未来 agent）的真实审批 → 发卡」。
  - 既有「deny-and-focus → abort 远程、reason=`answered_elsewhere`、永不本地 allow」继续守安全不变量。

### V3.2-P2C 回归 ✅（自动化）/ ⏳（真机）
- 关键模块逐项绿：runner 24/24、settings 14/14、feishu-main 6/6、permission-approval 18/18、broker 11/11、server-route-permission 55/55、prefs 113/113、i18n 6/6、settings-renderer-browser-env 145/145。
- 全量回归 `node test/run-tests.js` 结果见下方"全量"行。
- ⏳ 真机走查（发审批→飞书出卡→放置数分钟不动仍在、不 Expired→桌面点 Allow→飞书同步"已在别处处理"；再发→飞书点→桌面同步）需用户在本机确认。

### 影响文件（V3.2）
`src/feishu-approval-runner.js`、`src/feishu-approval-settings.js`、`src/feishu-approval-main.js`、`src/settings-tab-telegram-approval.js`、`src/settings-i18n.js`、`test/feishu-approval-runner.test.js`、`test/feishu-approval-settings.test.js`、`test/permission-telegram-approval.test.js`、`test/prefs.test.js`、`test/settings-renderer-browser-env.test.js`

> **全量回归**：`node test/run-tests.js` = **4233 用例 / 4220 通过 / 1 失败**；唯一失败为既有遗留 `agent-installation-detector › bare Hermes home ... low-confidence residue`（未触碰，无关）。→ 飞书 V3.2 **零回归**。
