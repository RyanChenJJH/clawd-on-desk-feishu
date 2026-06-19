# 飞书远程审批第二版进阶开发方案草案

> 状态：待确认。第二版建立在第一版 MVP 稳定可用之后，不与第一版同时强行实施。

## 1. 第二版定位

第一版目标是安全、窄面、可回滚地打通飞书审批闭环。第二版目标是在不破坏第一版和现有 Telegram 功能的前提下，完善远程审批体系，让飞书从“能审批”进阶到“好用、可诊断、可维护、方便长期 fork 合并”。

第二版仍不改变本地 permission bubble 的主路径。远程审批永远是可选通道，不能替用户绕过本地安全语义。

## 2. 第二版新增能力

建议第二版包含这些进阶能力：

- 飞书 rich approval：
  - 支持 Telegram 已有的 `permission_suggestions`。
  - 支持 Always allow / Always deny / mode change 等安全建议按钮。
  - 只对 `REMOTE_RICH_APPROVAL_AGENT_IDS` 支持的 agent 开启。
- 飞书 completion notification：
  - agent 会话完成后向飞书发送完成通知。
  - 默认关闭。
  - 输出内容默认 `off`，用户明确确认后才允许 `full`。
- 飞书 `/status` 或卡片状态查询：
  - 返回 Clawd 连接状态、pending approvals 数量、最近错误、启用通道。
  - 与 Telegram native `/status` 对齐。
- 多接收人和多通道策略：
  - 支持多个飞书目标会话或多个允许审批人。
  - 默认仍是 first decision wins。
  - 可选地只允许指定 approver ID 生效，其他点击只回 `Not allowed`。
- 卡片生命周期完善：
  - 本地审批已完成时，飞书卡片更新为 handled。
  - 超时后卡片更新为 expired。
  - 点击过期卡片只提示 expired，不影响 permission。
- Doctor / diagnostics：
  - Settings 中展示飞书 app credential 状态、Channel 连接状态、权限缺失提示。
  - Doctor 增加飞书配置检查，给出明确修复建议。
- 上游合并辅助：
  - 形成稳定 `remote-approval` provider 目录结构。
  - 收敛现有 Telegram 和飞书的共同接口，减少未来新增通道时改主链路。

## 3. 模块化升级方案

第二版建议在第一版薄 broker 基础上，把远程审批相关公共代码收敛到独立目录。

建议结构：

```txt
src/
  remote-approval/
    broker.js
    decision.js
    payload.js
    provider-registry.js
    redaction.js
    status.js
    providers/
      telegram-provider.js
      feishu-provider.js
```

迁移原则：

- 不一次性搬空 Telegram 现有实现。
- 先用 provider wrapper 适配现有 Telegram runner。
- 飞书从一开始就按 provider 接口实现。
- 等测试稳定后，再考虑把公共 payload / redaction 从 `permission.js` 中抽出。
- 每次抽取都必须保持行为等价，并有测试覆盖。

Provider 接口建议：

```js
{
  id: "telegram" | "feishu",
  label: "Telegram" | "Feishu",
  isConfigured(): boolean,
  isEnabled(): boolean,
  getStatus(): object,
  requestApproval(payload, options): Promise<RemoteDecision | null>,
  sendNotification?(payload, options): Promise<object>,
  handleStatusCommand?(payload): Promise<string | object>
}
```

## 4. 不影响现有功能的原则

第二版更容易触碰公共抽象，因此必须更严格：

- 所有新增能力默认关闭。
- Telegram provider wrapper 必须先跑现有 Telegram 测试。
- 飞书 rich approval 只在 provider 能力声明 `supportsRichApproval=true` 时启用。
- completion notification 和 approval 开关绑定：关闭飞书审批时，飞书通知也停止。
- Direct Send 不进入第二版默认目标，除非另立方案和确认。
- 远程通道失败只降级，不对 agent 自动 allow 或 deny。

## 5. 上游合并友好设计

第二版的核心不是“多写功能”，而是把 fork 差异变成清晰模块。

合并策略：

- 新增目录 `src/remote-approval/` 承担 fork 侧主要差异。
- 对上游高频改动文件保持薄接入：
  - `main.js` 只调用 `createRemoteApprovalRuntime()`。
  - `permission.js` 只调用 `remoteApprovalBroker.startForPermission()`。
  - `settings-actions.js` 只注册 provider commands。
  - Settings UI 只挂载 provider panel。
- 写一份 `docs/Expand_function/feishu/upstream-merge-checklist.md`：
  - 合并上游前后要跑哪些测试。
  - 哪些文件是预期冲突点。
  - 冲突解决优先保留上游主链路，再重新接入 provider。
- 所有 provider 都用 feature flag / readiness 控制，不在启动时强制拉起网络。

## 6. 第二版功能细节

### 6.1 Rich Approval

目标：飞书卡片支持权限建议按钮。

行为：

- 对 Claude Code / CodeBuddy 的建议按钮显示短标签。
- callback value 只带 nonce 和 suggestion index，不带完整 rule 内容。
- rule 内容仍只保存在本地 pending permission 中。
- 点击 suggestion 后，broker 调用 `applyPermissionSuggestion()`，再 allow。

限制：

- Codex / Qwen / Copilot 等 wire format 不支持 rich decision 时，不显示 suggestion。
- label 必须截断并 redacted。

### 6.2 Completion Notification

目标：会话完成后向飞书发送简短通知。

行为：

- 默认只发送 bare ping。
- `completionOutputMode=full` 必须用户明确确认。
- 消息长度限制和 redaction 与 Telegram 对齐。
- 失败不重试过久，避免积压。

### 6.3 Status Command

目标：用户在飞书里能查询 Clawd 远程审批状态。

行为：

- 支持 `/status` 或飞书卡片按钮“Refresh status”。
- 只响应 allowed approver。
- 返回：飞书连接、Telegram 连接、pending approval 数、最近错误、DND 状态。

### 6.4 Diagnostics

目标：减少飞书配置排错成本。

检查项：

- credentials 文件存在但格式错误。
- app id / secret 无效。
- Channel 未连接。
- 缺少 `card.action.trigger`。
- 机器人未加入目标会话。
- receive id 类型和 id 不匹配。

## 7. 数据结构扩展

第二版可以扩展 `feishuApproval`，但必须保持向后兼容：

```js
{
  enabled: false,
  region: "feishu",
  receiveIdType: "chat_id",
  receiveId: "",
  allowedUserId: "",
  allowedOpenId: "",
  notifyOnComplete: false,
  completionOutputMode: "off",
  richApprovalEnabled: false,
  statusCommandEnabled: true,
  recipients: []
}
```

兼容策略：

- 第一版字段保持不变。
- 新字段都有默认值。
- `recipients` 缺省时继续使用第一版单目标字段。
- prefs migration 只新增默认，不改旧值语义。

## 8. 第二版不做项

- 不做飞书审批流 API。
- 不做远程 shell。
- 不做默认开启 Direct Send。
- 不做群投票审批。
- 不做自动创建飞书应用，除非 SDK spike 明确安全且低风险。
- 不把 Telegram 迁移到飞书逻辑内。

## 9. 第二版验收标准

功能验收：

- 第一版所有能力保持可用。
- 飞书 rich approval 能对支持 agent 生效。
- 飞书 completion notification 默认关闭，开启后可收到通知。
- 飞书 status 查询只响应授权用户。
- 卡片 handled / expired 状态正确。
- 多通道并发仍只结算一次。

工程验收：

- 远程审批公共逻辑收敛到独立模块。
- `permission.js` 和 `main.js` 改动保持薄接入。
- Telegram 现有测试不回归。
- 飞书新增测试覆盖 runner、rich approval、notification、status command。
- 增加上游合并检查清单。

## 10. 第二版启动条件

只有同时满足以下条件才建议启动第二版：

- 第一版真实飞书审批已在 Windows 验证通过。
- 第一版没有发现 secret 泄露或 permission 误结算问题。
- Telegram 原有审批无回归。
- 用户确认需要 rich approval / completion notification / diagnostics 中至少两项。
- 第一版代码已稳定到可以承受模块抽取。
