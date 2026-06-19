# 飞书远程审批第二版阶段任务计划草案

> 状态：待确认。第二版必须在第一版交付、验证、稳定后再开始。

## 阶段 V2-0：第一版复盘和启动评估

目标：确认第二版有必要启动，并明确只做进阶完善，不修补第一版未完成的核心缺陷。

任务：

- 复盘第一版真实飞书审批结果。
- 汇总第一版缺陷和用户反馈。
- 确认是否需要 rich approval、completion notification、status command、diagnostics。
- 确认第一版对 Telegram 和本地 bubble 没有回归。
- 确认上游 fork 同步压力，决定是否先做模块化收敛。

通过标准：

- 第一版稳定。
- 第二版范围被确认。
- 不把第一版 blocker 混进第二版。

## 阶段 V2-1：远程审批模块目录和 provider registry

目标：把远程审批公共能力收敛到独立模块，减少长期 fork 冲突。

任务：

- 新增 `src/remote-approval/` 目录。
- 新增 `broker.js`、`provider-registry.js`、`decision.js`、`status.js`。
- 为现有 Telegram runner 写 provider wrapper。
- 为飞书 runner 写 provider wrapper。
- `permission.js` 保持薄接入，只调用 broker。
- `main.js` 保持薄接入，只创建 runtime 和 providers。

涉及文件：

- `src/remote-approval/broker.js`
- `src/remote-approval/provider-registry.js`
- `src/remote-approval/decision.js`
- `src/remote-approval/status.js`
- `src/remote-approval/providers/telegram-provider.js`
- `src/remote-approval/providers/feishu-provider.js`
- `src/permission.js`
- `src/main.js`

通过标准：

- Telegram 测试不回归。
- 第一版飞书测试不回归。
- broker 单测覆盖 provider 注册、启停、first decision wins、abort。

## 阶段 V2-2：Rich Approval

目标：飞书支持权限建议按钮。

任务：

- 抽出通用 suggestion label builder。
- 飞书卡片支持 suggestion button。
- callback value 只包含 nonce 和 suggestion index。
- broker 校验 provider capability 后才接受 suggestion。
- 保持 unsupported agent 不显示 rich buttons。

涉及文件：

- `src/remote-approval/payload.js`
- `src/remote-approval/decision.js`
- `src/feishu-card-builder.js`
- `src/feishu-approval-runner.js`
- `test/feishu-approval-runner.test.js`
- `test/permission-remote-approval.test.js`

通过标准：

- 支持 agent 的 suggestion 能正确 apply 并 allow。
- 不支持 agent 的 suggestion 被隐藏或忽略。
- 无效 index 被忽略，不结算 permission。

## 阶段 V2-3：Completion Notification

目标：飞书可选发送会话完成通知。

任务：

- 在 `feishuApproval` 增加 `notifyOnComplete` 和 `completionOutputMode`。
- 实现 `sendNotification()`。
- 对齐 Telegram completion notification 的隐私默认：
  - 默认关闭。
  - 默认不发送完整输出。
  - 开启 full output 需要确认。
- 接入 session snapshot fanout。
- 失败限时、限次，不阻塞主流程。

涉及文件：

- `src/feishu-approval-settings.js`
- `src/feishu-approval-runner.js`
- `src/main.js`
- `src/settings-tab-telegram-approval.js`
- `test/completion-notify-integration.test.js`
- `test/feishu-approval-runner.test.js`

通过标准：

- 默认不发送 completion notification。
- 开启后能收到通知。
- 关闭飞书审批时通知也停止。
- 发送失败不影响 session 状态。

## 阶段 V2-4：Status Command 和状态卡片

目标：用户可以在飞书中查询远程审批状态。

任务：

- 支持 `/status` 或交互卡片状态刷新。
- 只响应 allowed approver。
- 输出 DND、pending approvals、飞书连接、Telegram 连接、最近错误。
- 复用 Telegram status diagnostic 的格式思想，但不耦合 Telegram 代码。

涉及文件：

- `src/remote-approval/status.js`
- `src/feishu-approval-runner.js`
- `src/main.js`
- `test/feishu-approval-runner.test.js`

通过标准：

- 授权用户能查询状态。
- 非授权用户无权查询。
- 输出不泄露 token、chat id、open id。

## 阶段 V2-5：Diagnostics / Doctor

目标：降低飞书配置排错成本。

任务：

- Settings 显示最近连接错误和权限提示。
- Doctor 增加飞书检查项。
- 检查 credentials 文件、配置完整性、runner 状态、最近 API 错误。
- 输出用户可执行的修复建议。

涉及文件：

- `src/doctor.js`
- `src/doctor-report.js`
- `src/doctor-ipc.js`
- `src/settings-tab-telegram-approval.js`
- `src/feishu-approval-runtime-status.js`
- `test/doctor*.test.js`
- `test/settings-renderer-browser-env.test.js`

通过标准：

- 错误 secret、缺 recipient、未连接、缺权限都有可读提示。
- Doctor 输出不泄露 secret。

## 阶段 V2-6：多接收人和多审批人

目标：让飞书通道支持更复杂的团队使用方式。

任务：

- 新增 `recipients` 配置数组。
- 保持第一版单 recipient 字段兼容。
- 支持多个目标会话发送同一审批卡。
- 支持多个 allowed approver。
- 任一合法 approver 的 first decision wins。
- 非法 approver 点击只提示 Not allowed。

涉及文件：

- `src/feishu-approval-settings.js`
- `src/feishu-approval-runner.js`
- `src/settings-tab-telegram-approval.js`
- `test/feishu-approval-settings.test.js`
- `test/feishu-approval-runner.test.js`

通过标准：

- 旧配置仍能工作。
- 多接收人能收到卡片。
- 多审批人中任一合法用户可审批。
- 重复或晚到点击不会二次结算。

## 阶段 V2-7：上游合并检查清单和回归套件

目标：让 fork 项目后续合并原作者更新时有固定流程。

任务：

- 新增 `docs/Expand_function/feishu/upstream-merge-checklist.md`。
- 列出高风险冲突文件：
  - `src/main.js`
  - `src/permission.js`
  - `src/prefs.js`
  - `src/settings-actions.js`
  - `src/settings-tab-telegram-approval.js`
  - `package.json`
- 列出合并后必须跑的测试。
- 记录如何临时禁用飞书 provider 以定位回归。

通过标准：

- 文档可直接用于一次上游 merge 操作。
- 测试命令明确。
- 飞书 provider 可独立关闭。

## 阶段 V2-8：最终验证

目标：确认第二版能力没有破坏第一版和现有功能。

任务：

- 运行 `npm test`。
- 专项测试：
  - remote approval broker。
  - Telegram provider wrapper。
  - Feishu runner。
  - Feishu rich approval。
  - Feishu completion notification。
  - Feishu status command。
  - Settings UI。
- 手动验证：
  - 第一版基础审批。
  - rich approval。
  - completion notification。
  - status command。
  - 多接收人。
  - Telegram 和飞书同时启用。
  - 飞书关闭后无网络行为。

通过标准：

- 自动化测试通过。
- 第一版功能保持可用。
- Telegram 功能保持可用。
- 未配置或关闭飞书时，现有功能行为与第一版前一致。

## 第二版里程碑

1. V2-M1：第一版复盘完成。
2. V2-M2：provider registry 完成，Telegram / 飞书不回归。
3. V2-M3：rich approval 完成。
4. V2-M4：completion notification 完成。
5. V2-M5：status command 和 diagnostics 完成。
6. V2-M6：多接收人完成。
7. V2-M7：上游合并检查清单和最终验证完成。
