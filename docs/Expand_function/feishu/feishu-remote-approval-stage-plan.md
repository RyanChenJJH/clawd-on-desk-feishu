# 飞书远程审批第一版阶段任务计划草案

> 状态：第一版推荐方向已获用户同意；新增第二版和模块化约束仍以文档确认为准。未确认前不进入实现。

## 阶段 0：需求确认和实现闸门

目标：确认产品边界，避免实现时反复推翻。

任务：

- 确认飞书采用“自建应用机器人”而不是“自定义机器人 webhook”。
- 确认 MVP 动作只包含 Allow once / Deny。
- 确认 Telegram 和飞书可同时启用，且 first decision wins。
- 确认是否新增 `@larksuiteoapi/node-sdk` 依赖。
- 确认 region 默认值：推荐 `feishu`，可选 `lark`。
- 确认目标会话配置方式：推荐手动输入 `receiveIdType + receiveId`。
- 确认新增硬约束：模块化、默认关闭、不影响现有功能、方便后续合并原作者更新。

产出：

- 用户明确批准第一版开发方案、阶段计划和新增硬约束。

通过标准：

- 用户回复同意或给出替代选择。

## 阶段 1：飞书 SDK 和真实能力 spike

目标：在最小代码外壳中验证飞书关键链路，避免主线实现后才发现 SDK 或权限不可用。

任务：

- 安装或临时验证 `@larksuiteoapi/node-sdk`。
- 验证 CommonJS `require("@larksuiteoapi/node-sdk")` 在当前 Electron / Node 环境可用。
- 用测试飞书自建应用验证：
  - `createLarkChannel()` 可连接。
  - `channel.send(chatId, { card })` 可发送 v2 card。
  - `channel.on("cardAction")` 能收到按钮点击。
  - 缺少 `card.action.trigger` 时能识别失败表现。
- 验证 `domain` 可在 Feishu / Lark 之间切换。
- 记录 SDK 在代理环境、错误 secret、无权限、机器人未入群时的错误形态。

涉及文件：

- spike 脚本可放到临时目录或 `tools/`，实现结束前按需删除或转成测试工具。

通过标准：

- 真实飞书测试卡能发送并收到按钮回调。
- 明确 SDK 是否可作为正式依赖。
- 明确最小权限和用户配置 checklist。

回退方案：

- 如果 SDK 不适合主进程，改为手写 OpenAPI + WebSocket。
- 如果长连接不可用，重新评估公网 webhook 成本，不进入正式实现。

## 阶段 2：通用远程审批 broker

目标：把 Telegram-only 入口变成多通道入口，为飞书接入提供稳定边界。

任务：

- 新增薄 broker，优先放在独立文件 `src/remote-approval-broker.js`。
- 在 `src/permission.js` 中只保留小接入点，避免把飞书逻辑写入 permission 主体。
- 将 `ctx.getTelegramApprovalClient()` 扩展为 `ctx.getRemoteApprovalClients()`。
- 将单个 `remoteApprovalAbortController` 改为每通道独立 controller。
- 保持现有 `isRemoteApprovalActionable()` 和 summary-only 策略。
- 保持 Telegram 行为不回归。
- 新增 first decision wins 逻辑。
- 新增 late decision ignored / aborted 逻辑。
- 飞书未启用时 broker 返回空影响，现有行为保持一致。

涉及文件：

- `src/remote-approval-broker.js`
- `src/permission.js`
- `src/main.js`
- `test/permission-telegram-approval.test.js`
- 新增 `test/permission-remote-approval.test.js`

通过标准：

- 现有 Telegram 审批测试全部通过。
- fake Telegram + fake Feishu 同时启用时，任一通道先返回都会结算一次。
- 本地 bubble 先结算时，所有远端通道被 abort。
- 飞书关闭或未配置时，broker 不启动任何飞书网络行为。

## 阶段 3：飞书设置、密钥和状态

目标：增加飞书配置数据层和 Settings command，不启动真实审批。

任务：

- 新增 `src/feishu-approval-settings.js`：
  - defaults / normalize / validate / readiness。
  - credentials env file path。
  - masked App Secret。
  - redaction secrets。
- 在 `src/prefs.js` 新增 `feishuApproval` schema。
- 在 `src/settings-actions.js` 新增 commands：
  - `feishuApproval.setCredentials`
  - `feishuApproval.deleteCredentialsFile`
  - `feishuApproval.status`
  - `feishuApproval.credentialsInfo`
  - `feishuApproval.test`
- 在 `src/main.js` 增加 credentials 文件读写、状态读取、redaction 日志 helper。
- 不复用或污染 `tgApproval` 字段。

涉及文件：

- `src/feishu-approval-settings.js`
- `src/prefs.js`
- `src/settings-actions.js`
- `src/main.js`
- `test/feishu-approval-settings.test.js`
- `test/prefs.test.js`
- `test/settings-actions.test.js`

通过标准：

- secret 不写入 prefs。
- renderer 只能看到 masked secret。
- readiness 能区分 disabled、missing-credentials、missing-recipient、invalid-config。
- `npm test` 相关单测通过。

## 阶段 4：飞书 runner 和审批卡片

目标：实现飞书真实通道，但先通过 fake channel 单测锁定行为。

任务：

- 新增 `src/feishu-approval-runner.js`。
- 新增 `src/feishu-card-builder.js` 或在 runner 内保持纯函数：
  - 构造 v2 approval card。
  - callback value 内包含 nonce 和 action。
  - 控制文本长度，复用 redaction。
- 实现 runner API：
  - `isEnabled()`
  - `start()`
  - `stop()`
  - `requestApproval(payload, { signal })`
  - `sendTestCard()`
  - `getStatus()`
- 处理 callback：
  - 校验 nonce。
  - 校验 allowed user。
  - allow / deny 归一化为通用 decision。
  - 过期或未匹配点击返回 expired。
- 实现超时、abort、断线重连状态。
- 尽量在结算后更新卡片为已处理或过期。

涉及文件：

- `src/feishu-approval-runner.js`
- `src/feishu-card-builder.js`
- `src/main.js`
- `test/feishu-approval-runner.test.js`
- `test/fakes/feishu-channel.js`

通过标准：

- fake channel 可覆盖 allow / deny / unauthorized / timeout / abort / send failure。
- 网络或发送失败只返回 null，不影响本地审批。
- runner stop 会清空 pending approvals。

## 阶段 5：Settings UI 和 i18n

目标：让用户可以在 Remote Approval 页配置、启用和测试飞书。

任务：

- 在现有 Remote Approval tab 新增 Feishu channel card。
- 新增 App credentials、Recipient、Enable & Test 三步 UI。
- 显示状态 badge：Incomplete / Ready / Starting / Running / Failed。
- 保存 region、receiveIdType、receiveId、allowed approver。
- 保存 / 替换 / 删除 credentials。
- Send test 按钮调用 `feishuApproval.test`。
- 新增 en / zh / zh-TW / ko / ja 文案。
- 必要时把 `settings-tab-telegram-approval.js` 内通用 channel helper 抽出，避免继续膨胀。

涉及文件：

- `src/settings-tab-telegram-approval.js`
- `src/settings-renderer.js`
- `src/settings.css`
- `src/i18n.js` 或现有 settings i18n 文件
- `test/settings-renderer-browser-env.test.js`

通过标准：

- 飞书卡片渲染在 Telegram 卡片之后、Hardware Buddy 之前或之后，顺序明确。
- 未配置 credentials / recipient 时 Enable 和 Test 禁用。
- 保存失败有 toast。
- 原始 App Secret 不出现在 DOM。

## 阶段 6：接入权限主链路

目标：飞书接入真实 permission request，端到端可用。

任务：

- `main.js` 初始化 Feishu runner。
- `getRemoteApprovalClients()` 返回 Telegram 和 Feishu 的活动 client。
- Settings 更新时启动/停止 Feishu runner。
- permission request 触发时飞书收到卡片。
- 飞书点击后结算 `resolvePermissionEntry()`。
- 本地 bubble 先处理时飞书 pending 被 abort。
- Telegram 和飞书同时启用时只结算一次。

涉及文件：

- `src/main.js`
- `src/permission.js`
- `test/permission-remote-approval.test.js`
- `test/main-*.test.js` 中必要的初始化覆盖

通过标准：

- fake client 单测证明多通道决策稳定。
- 真实 Claude Code 或 CodeBuddy permission 可由飞书审批结算。
- Codex official PermissionRequest 在 intercept mode 下行为和 Telegram 保持一致。

## 阶段 7：文档、限制和真实 QA

目标：把功能交付成用户可用状态。

任务：

- 新增 `docs/guides/feishu-approval.md`。
- 更新 `docs/guides/setup-guide.md` 和中文版本。
- 更新 `docs/guides/known-limitations.md`。
- 更新 release note 草稿。
- 记录飞书应用配置步骤：
  - 创建自建应用。
  - 开启机器人。
  - 配置权限。
  - 订阅 `card.action.trigger`。
  - 安装应用到企业或目标群。
  - 获取 `chat_id` / `open_id` / `user_id`。
- Windows 真实 QA。
- macOS / Linux 残余风险说明。

涉及文件：

- `docs/guides/feishu-approval.md`
- `docs/guides/setup-guide.md`
- `docs/guides/setup-guide.zh-CN.md`
- `docs/guides/known-limitations.md`
- `docs/releases/*.md` 或待发布 note

通过标准：

- 用户能按文档完成飞书配置。
- 文档明确说明不支持远程 shell / prompt。
- 文档明确说明飞书失败时本地 bubble 仍是 fallback。

## 阶段 8：最终验证

目标：确认没有破坏既有 Telegram、permission bubble 和设置系统。

任务：

- 运行 `npm test`。
- 专项运行：
  - `node test/run-tests.js test/permission-telegram-approval.test.js`
  - `node test/run-tests.js test/permission-remote-approval.test.js`
  - `node test/run-tests.js test/feishu-approval-settings.test.js`
  - `node test/run-tests.js test/feishu-approval-runner.test.js`
  - `node test/run-tests.js test/settings-renderer-browser-env.test.js`
- 手动验证：
  - Telegram 原有审批。
  - 飞书测试卡。
  - 飞书真实审批。
  - DND。
  - Disable Feishu。
  - 多通道同时启用。
- 合并友好检查：
  - 列出现有文件改动点。
  - 确认没有改 agent hook 协议。
  - 确认没有迁移或重写 Telegram migration state machine。

通过标准：

- 自动化测试通过。
- 真实飞书审批有截图或日志证据。
- 没有 secret 泄露到 prefs、renderer 或日志。
- 飞书未启用时，当前版本现有功能行为保持一致。

## 建议里程碑

1. M1：需求确认完成。
2. M2：SDK spike 通过。
3. M3：通用 broker 合并且 Telegram 不回归。
4. M4：飞书 settings 和 runner fake tests 通过。
5. M5：Settings UI + 真实飞书 test card 通过。
6. M6：真实 permission request 通过。
7. M7：文档、测试、release note 完成。

## 暂不实施项

- 一键注册飞书应用。
- completion notification。
- Direct Send。
- 群内多审批人投票。
- 飞书审批流 API。
- 移动端 LAN companion 的审批能力。

## Post-Phase 8 V1 Bugfix Task Addendum

Date: 2026-06-13

This addendum remains inside Version 1. It does not introduce Version 2
capabilities.

Added tasks:

- Add a Settings-only Feishu Send Test diagnostic log panel below the test card
  row. The panel appears only after the user starts a Send Test run.
- Return safe test logs from `feishuApproval.test` / `sendTestCard()` for
  runner start, card send, waiting for callback, ignored approver, timeout,
  and send failure.
- Treat configured `allowedOpenId` and `allowedUserId` as alternative valid
  approver identifiers instead of requiring both to be present in every
  callback event.
- Keep raw `card.action.trigger` context parsing covered by tests as a fallback
  to the SDK-normalized `cardAction` shape.

Acceptance additions:

- When a test card is delivered but no callback arrives, Settings must show a
  timeout log that points users to `card.action.trigger` subscription and
  long-connection event configuration.
- When a callback arrives from a non-matching approver, Settings must show an
  approver mismatch log instead of silently timing out.
- No real App Secret or raw real recipient/approver IDs may be written to docs,
  prefs, renderer DOM logs, or test fixtures.
