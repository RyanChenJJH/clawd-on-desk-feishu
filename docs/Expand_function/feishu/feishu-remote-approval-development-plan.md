# 飞书远程审批第一版开发方案草案

> 状态：第一版推荐方向已获用户同意；新增第二版和模块化约束仍以文档确认为准。本文档只做调研和方案设计，不代表已经开始实现。

## 1. 目标

在现有 Remote Approval 模块中，除 Telegram 外新增飞书审批通道。用户在 Claude Code / CodeBuddy / Codex 等受支持 agent 触发权限请求时，Clawd 继续展示本地 permission bubble，同时向飞书发送一张可交互审批卡片。用户在飞书点击允许或拒绝后，Clawd 用同一条 pending permission 进行结算。

本期不做远程 shell、不做任意 prompt 提交、不替代本地 bubble，只做审批通道扩展。

## 1.1 新增硬约束

这些约束优先级高于具体实现细节：

- 功能必须模块化。飞书代码应集中在独立模块中，主链路只通过小型 adapter / broker 接口接入。
- 不可影响和改变现有功能。Telegram、Hardware Buddy、本地 permission bubble、DND、headless、agent hook 行为必须保持兼容。
- 功能默认关闭。未配置飞书时，启动成本、网络连接、权限审批行为都应与当前版本一致。
- 对上游 fork 合并友好。尽量避免大规模重构上游文件，所有必要改动要集中、可回滚、可用测试保护。
- 不绕过现有设置体系。Settings 仍遵守 `prefs.js` -> `settings-controller.js` -> `settings-store.js`，写入 side effects 仍走 `settings-actions.js`。
- 不改变 agent 协议。Claude / Codex / CodeBuddy 等 hook payload 和响应格式不因飞书接入而变化。

## 2. 调研结论

结论：可行，推荐使用飞书开放平台自建应用机器人 + SDK 长连接/WebSocket + 交互卡片按钮回调。

关键依据：

- 飞书官方 Node SDK 支持 CommonJS，现有项目是 CommonJS，可以直接接入或先 spike 验证 `require("@larksuiteoapi/node-sdk")`。SDK 文档同时示例了 `Client` 的 `im.message.create` 发送消息能力和 `msg_type: "interactive"` 交互卡片能力。参考：[larksuite/node-sdk README](https://github.com/larksuite/node-sdk)。
- SDK 的 Channel 模块默认使用 WebSocket 长连接，官方说明长连接不需要公网 IP、域名、防火墙白名单，适合桌面应用本地运行。参考：[Subscribing to Events Using Long Connection Mode](https://github.com/larksuite/node-sdk#subscribing-to-events-using-long-connection-mode)。
- Channel 模块明确包含 card interactions，并暴露 `channel.on("cardAction")`。官方 common issues 也说明卡片按钮不触发通常是缺少 `card.action.trigger` 订阅或仍在用 v1 卡片 schema，v2 卡片按钮需要 callback behavior。参考：[Channel module docs](https://github.com/larksuite/node-sdk/blob/main/docs/channel.md)。

不推荐只用飞书“自定义机器人 webhook”作为审批闭环。自定义机器人适合单向发通知，但审批需要按钮回调和用户身份校验；为了可靠闭环，应该走应用机器人。

## 3. 现有代码可复用点

当前 Telegram 审批已经形成了可复用模式：

- `src/permission.js`
  - `maybeStartRemoteApproval(permEntry)` 在本地 bubble 创建后发起远程审批。
  - `buildRemoteApprovalPayload(permEntry)` 只发送安全 summary，不发送完整 tool input。
  - `normalizeRemoteApprovalDecision()` 统一远端 allow / deny / suggestion 决策。
  - `resolvePermissionEntry()` 是所有审批结果的最终结算点。
- `src/main.js`
  - `getTelegramApprovalClient()` 向权限模块暴露 `{ isEnabled, requestApproval }` 形态的 client。
  - Telegram native runner 负责轮询/长连接、测试卡、真实审批、超时和状态。
- `src/settings-tab-telegram-approval.js`
  - Settings 页标题已经是 Remote Approval。
  - Telegram 和 Hardware Buddy 都以 channel card 方式呈现，适合扩展飞书卡片。
- `src/prefs.js`
  - `tgApproval` 是持久化设置，token 存在 userData 独立 env 文件，不放入 prefs。

这意味着飞书不需要侵入各 agent hook，也不需要改 Claude / Codex / CodeBuddy 的审批协议。它应作为第二个远程通道挂到同一个 pending permission 生命周期上。

## 3.1 模块化边界建议

为降低回归和上游合并冲突，第一版不建议重写 Telegram 体系，也不建议把 Settings 页整体重构。采用“薄 broker + 独立 provider”的方式：

- 新增独立飞书模块：
  - `src/feishu-approval-settings.js`
  - `src/feishu-approval-runner.js`
  - `src/feishu-card-builder.js`
- 新增通用但很薄的远程审批 broker：
  - 可先放在 `src/remote-approval-broker.js`，只处理 provider fan-out、abort、first decision wins。
  - `src/permission.js` 只调用 broker，不直接知道飞书细节。
- `src/main.js` 只负责初始化 provider 并暴露 `getRemoteApprovalClients()`。
- `src/settings-tab-telegram-approval.js` 只追加 Feishu channel card；若必须抽 helper，限定为 UI 小函数，不做整页重写。

第一版应避免：

- 迁移或改名现有 Telegram 文件。
- 重排 `main.js` 大段生命周期逻辑。
- 改动 agent hook 文件。
- 改动现有 Telegram migration state machine。
- 让飞书设置复用 `tgApproval` 字段。

## 3.2 上游合并友好策略

这个项目来自 fork，后续需要合并原作者更新，因此实现时按以下策略控制冲突：

- 新功能尽量新增文件，少改现有文件。
- 必须改现有文件时，使用小而稳定的接入点：
  - `prefs.js`：只新增 `feishuApproval` schema。
  - `settings-actions.js`：只新增 `feishuApproval.*` commands。
  - `main.js`：只新增飞书 runner 生命周期和 `getRemoteApprovalClients()` 聚合。
  - `permission.js`：只把 Telegram 单通道入口替换为 broker 调用。
  - Settings UI：只新增 Feishu card，保留现有 Telegram card 结构。
- 给每个接入点加测试，未来合并上游后用测试确认没有漂移。
- 不把飞书逻辑散落到 agent registry、hook installer、theme、remote ssh 等无关模块。
- 新增依赖必须集中说明在 `package.json`，并在 runner 中 lazy require，避免未启用飞书时启动失败。
- 文档维护一份“上游合并检查清单”，后续同步原作者代码时先跑相关测试。

## 4. 待你确认的问题

1. 飞书接入方式是否接受“自建应用机器人”？
   - 推荐：接受。MVP 让用户在飞书开放平台手动创建企业自建应用，复制 App ID / App Secret 到 Clawd。后续再考虑 SDK 的 `registerApp` 一键注册能力。

2. 审批消息发到哪里？
   - 推荐：MVP 支持一个固定目标会话，优先支持私聊或指定群 `chat_id`。设置里保存 `receiveIdType` 和 `receiveId`，并保存允许点击审批的用户 ID。

3. Telegram 和飞书是否可以同时启用？
   - 推荐：可以同时启用。两个通道都会收到卡片，最先到达的明确决策生效，另一个通道的卡片变为过期或按钮失效。这样保留 Telegram 用户习惯，也便于迁移。

4. 飞书第一版是否需要支持 rich approval？
   - 推荐：第一版做 Allow once / Deny。第二阶段再接 Telegram 已有的 permission suggestions，例如 Always allow / mode change。原因是飞书 v2 card schema 和 callback value 需要先跑通。

5. 是否同步做 completion notification 和 Direct Send？
   - 推荐：不放入 MVP。先做到审批闭环稳定，再评估 completion notification。Direct Send 涉及远程输入和焦点控制，风险更高，不应和审批首版混在一起。

6. 飞书环境是中国飞书还是海外 Lark？
   - 推荐：设置里加 region，默认 `feishu`，可选 `lark`。SDK 支持 Feishu / Lark domain。

7. 是否允许依赖官方 SDK？
   - 推荐：允许，但第一阶段必须做依赖 spike。若 SDK 在 Electron 主进程、CommonJS、代理环境或打包环境中有问题，再退回手写 OpenAPI + WebSocket。

## 5. 推荐技术路线

### 5.1 新增通道抽象

把当前 Telegram-only 的远程审批入口扩成通用 remote approval clients。

建议接口：

```js
{
  id: "telegram" | "feishu",
  isEnabled(): boolean,
  requestApproval(payload, { signal }): Promise<
    null | "allow" | "deny" | { action: "allow" | "deny" | "suggestion", index?: number }
  >,
  sendNotification?(text): Promise<{ ok: boolean }>,
  getStatus?(): object
}
```

`permission.js` 中的 `maybeStartRemoteApproval()` 改为：

- 构造一次通用 payload。
- 从 `ctx.getRemoteApprovalClients()` 取出所有启用通道。
- 对每个通道启动一次 request。
- 任一通道返回 allow / deny 后调用 `resolvePermissionEntry()`。
- 本地 bubble、DND、agent fallback 或其他通道已结算时，中止所有未完成远程请求。

### 5.2 飞书配置和密钥

新增 `src/feishu-approval-settings.js`。

建议 prefs 字段 `feishuApproval`：

```js
{
  enabled: false,
  region: "feishu",
  receiveIdType: "chat_id",
  receiveId: "",
  allowedUserId: "",
  allowedOpenId: "",
  notifyOnComplete: false
}
```

建议 secret 文件：`userData/feishu-approval.env`。

```txt
CLAWD_FEISHU_APP_ID=cli_xxx
CLAWD_FEISHU_APP_SECRET=xxx
```

原则：

- App Secret 不进入 `clawd-prefs.json`。
- 原始 secret 不从 main IPC 返回 renderer。
- Settings 只展示 masked secret。
- logs 统一 redaction：app secret、bearer token、open_id / user_id / chat_id。

### 5.3 飞书运行时

新增 `src/feishu-approval-runner.js`。

职责：

- 初始化 SDK Channel 或底层 `Client` + `WSClient`。
- 连接飞书长连接。
- 发送测试卡和真实审批卡。
- 维护 `pendingApprovals: Map<id, entry>`。
- 处理 `cardAction` 回调。
- 校验点击用户是否为配置的 allowed user。
- TTL 超时后返回 `null`，不自动拒绝。
- 本地或其他通道已处理时，尽量更新飞书卡片为过期/已处理。

审批卡片建议内容：

- 标题：`{agentId} requests {toolName}`
- 字段：Agent、Tool、Folder、Summary
- 按钮：Allow once、Deny
- callback value：`clawd:approval:{nonce}:allow` / `clawd:approval:{nonce}:deny`

安全约束：

- 沿用现有 `buildRemoteApprovalPayload()`，没有 summary 不发送远程卡。
- 不发送完整命令、完整 diff、完整 tool input。
- 不支持 elicitation、ExitPlanMode、AskUserQuestion、opencode、passive notify、headless session。
- DND 或权限 bubble 被禁用时不发送飞书卡。

### 5.4 Settings UI

现有 `telegram-approval` tab 建议重命名显示文案为 Remote Approval，但文件名可以暂时不改，降低改动面。

新增飞书 channel card：

- Step 1：App credentials
  - App ID
  - App Secret
  - 保存后只展示 masked secret
- Step 2：Recipient
  - Region: Feishu / Lark
  - Receive ID type: chat_id / open_id / user_id
  - Receive ID
  - Allowed approver ID
- Step 3：Enable & Test
  - Enable Feishu approval
  - Send test approval

建议先不做飞书应用创建向导，只在文案里指向飞书开放平台配置步骤。

### 5.5 事件和权限配置说明

用户侧飞书应用需要：

- 启用机器人能力。
- 添加发送消息相关权限。
- 订阅 `card.action.trigger`。
- 使用 v2 交互卡片 schema。
- 目标私聊或群聊中能收到机器人消息。

具体权限名和控制台路径在实现前做一次真实应用验证，以飞书控制台当前提示为准。

### 5.6 多通道并发策略

推荐策略：parallel fan-out, first decision wins。

行为细节：

- 本地 bubble、Telegram、飞书任意一个先给出 allow / deny，即结算 pending permission。
- 结算时 abort 其他通道。
- 其他通道晚到的点击只能得到 expired / handled，不再影响 permission。
- 网络失败、连接失败、发送失败都只记录 warning，不替用户做 allow 或 deny。

### 5.7 测试策略

必须新增单元测试：

- `test/feishu-approval-settings.test.js`
  - normalize / validate / readiness / masked secret / redaction。
- `test/feishu-approval-runner.test.js`
  - fake channel 发送卡片、回调 allow / deny、非授权用户点击、超时、abort。
- `test/permission-remote-approval.test.js`
  - 多通道 fan-out。
  - first decision wins。
  - 本地 resolve 后 abort 飞书。
  - 无 summary 不发送。
  - DND / headless / unsupported agent 不发送。
- `test/settings-renderer-browser-env.test.js`
  - Remote Approval 页新增飞书卡片。
  - 保存 credentials / recipient / enable / test。
- `test/prefs.test.js`
  - `feishuApproval` schema 和 migration。

手动 QA：

- Windows 本机真实飞书应用：测试卡 allow / deny。
- 真实 Claude Code 或 CodeBuddy permission：飞书审批能结算本地 bubble。
- 飞书离线/错误 secret/缺权限时，本地 bubble 不受影响。
- Telegram 和飞书同时启用，先点任意一边，另一边不会二次结算。
- macOS / Linux 以代码审查和基础运行验证为主，真实飞书 QA 可后补。

## 6. 风险和缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 飞书 SDK Channel 在 Electron 主进程或打包环境中不稳定 | 审批通道无法连接 | Phase 1 独立 spike；保留手写 OpenAPI + WebSocket 备选 |
| SDK HTTP / WebSocket 不跟随系统代理 | 部分网络环境无法连飞书 | 先记录为已知限制；如 SDK 支持 `httpInstance`，尝试复用代理配置；否则后续引入明确代理设置 |
| 飞书卡片 callback 配置复杂 | 用户设置失败率高 | Settings 文案给出 checklist；状态里暴露缺权限/连接失败 |
| 多通道同时点击 | 重复审批 | pending permission 只允许 first decision wins，晚到决策忽略 |
| 发送过多敏感内容 | 隐私风险 | 沿用 summary-only 策略；无 summary 不发送远程卡 |
| app secret 泄露 | 安全风险 | secret 独立文件、masked UI、redacted log、不走 renderer raw IPC |
| 上游更新导致冲突 | 后续 fork 合并成本上升 | 新功能集中新增文件；现有文件只留小接入点；测试覆盖接入点 |
| 飞书默认开启影响现有用户 | Telegram 或本地 bubble 回归 | 默认关闭；未配置不启动 runner、不发网络请求 |

## 7. 非目标

- 不做飞书审批流 Approval API。
- 不做远程 shell。
- 不做飞书聊天桥。
- 不做 prompt 远程发送。
- 不改 agent hook 协议。
- 不改变 DND、headless、native fallback 的安全语义。

## 8. 验收标准

功能验收：

- Settings 里出现 Feishu channel card。
- 可保存飞书 App ID / App Secret，UI 不回显原文 secret。
- 可保存目标会话和允许审批用户。
- Enable 后状态显示 connected / running。
- Send test 可以在飞书收到卡片，点击 Allow / Deny 后 Settings 得到结果。
- 真实 permission request 会同步发本地 bubble 和飞书卡片。
- 飞书点击 Allow / Deny 能结算 agent permission。
- 飞书失败不影响本地 bubble。
- 同时启用 Telegram 和飞书时，任一通道先结算后不会重复结算。

工程验收：

- `npm test` 通过。
- 新增测试覆盖核心 settings、runner、permission fan-out。
- 飞书未启用时，现有 Telegram 审批测试、permission bubble 测试、settings 测试不回归。
- 现有功能文件改动可清晰解释为接入点改动，不做顺手重构。
- 文档更新 setup guide / known limitations。
- release note 标注飞书需要自建应用和真实飞书 QA 范围。

## 9. 需要你确认后才能实施

请先确认“待你确认的问题”中的选择，特别是：

- 是否接受自建应用机器人方案。
- MVP 是否只做 Allow once / Deny。
- Telegram 和飞书是否允许同时启用。
- 是否同意新增官方 SDK 依赖并先做 spike。

确认后再进入实现阶段。
## 10. Post-Phase 8 V1 Bugfix Notes

Date: 2026-06-13

The first-version scope remains unchanged: self-built Feishu/Lark app bot,
SDK long connection/WebSocket, interactive cards, Allow once / Deny only, and
first decision wins when Telegram and Feishu are both enabled.

Additional V1 requirements discovered during real Send Test debugging:

- Settings **Send test** must show a diagnostic log panel only after the user
  starts a Feishu test card run.
- The diagnostic log must distinguish runner start, card send attempt, card
  sent/waiting, callback payload parse failures, approver-id mismatches,
  timeout, and send failure.
- `allowedOpenId` and `allowedUserId` are alternative approver identifiers. If
  either configured ID matches the Feishu callback operator, the click is
  accepted.
- Raw `card.action.trigger` context fields should remain parseable as a
  defensive fallback in addition to the SDK-normalized `cardAction` event.
- Logs displayed in Settings must not include App Secret or raw real
  recipient/approver identifiers.
