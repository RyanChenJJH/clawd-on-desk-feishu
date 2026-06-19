# 原作者更新合并分析：4a6d9ce -> 10f4cd1

日期：2026-06-16

## 分析范围

- 当前 fork：`E:\Work2\AI_Work\tool\clawd-on-desk\clawd-on-desk-feishu\clawd-on-desk-feishu`
- 当前分支：`feature/health-reminder`
- 当前 HEAD：`4a6d9ce269e47325b4f03d4b845530ecaa61d80f`
- 原作者仓库：`E:\Work2\AI_Work\tool\clawd-on-desk\clawd-on-desk\clawd-on-desk`
- 原作者分支：`main`
- 原作者 HEAD：`10f4cd1b619639d9f5a2f97b972a095db84de574`
- 对比范围：`4a6d9ce..10f4cd1`

当前 fork 工作区不是干净状态：已有 36 个 tracked 文件修改，77 个 untracked 文件，主要属于 Feishu/Lark 远程审批和 Health Reminder 二开功能。本文只分析和制定方案，不执行合并。

## 上游更新规模

`4a6d9ce..10f4cd1` 共涉及 110 个文件，约 6519 行新增、157 行删除。

按目录粗分：

- `test/`：37 个文件
- `src/`：26 个文件
- `hooks/`：22 个文件
- `docs/`：8 个文件
- `agents/`：3 个文件
- `assets/`：3 个文件
- 其他：`package.json`、`package-lock.json`、README、CI、AGENTS 等

与当前 fork dirty tracked 文件重叠的上游文件只有 12 个：

- `docs/guides/known-limitations.md`
- `docs/guides/setup-guide.md`
- `docs/guides/setup-guide.zh-CN.md`
- `package-lock.json`
- `package.json`
- `src/main.js`
- `src/permission.js`
- `src/prefs.js`
- `src/settings-actions.js`
- `src/settings-i18n.js`
- `test/prefs.test.js`
- `test/settings-actions.test.js`

与当前 fork untracked 文件同名的上游新增/修改文件为 0 个。也就是说，Feishu 和 Health Reminder 的 fork-owned 新文件没有被上游同名覆盖，这是本次合并的有利条件。

## 原作者主要更新内容

### 1. 新增 CodeWhale 集成

上游新增 CodeWhale Phase 1 state-only 集成：

- `agents/codewhale.js`
- `hooks/codewhale-hook.js`
- `hooks/codewhale-install.js`
- `assets/icons/agents/codewhale.png`
- `docs/guides/codewhale-setup.md`
- 对 `agents/registry.js`、`src/integration-sync.js`、Doctor descriptors、Settings agent order、cleanup-integrations、agent detection、startup recovery 等做接入
- 配套测试：`test/codewhale-hook.test.js`、`test/codewhale-install.test.js` 等

特性：hook-only/state-only，不接管权限审批，`permissionApproval=false`、`interactiveBubble=false`。对 Feishu/Health Reminder 无直接功能冲突，但会碰 `prefs` agent 默认值、Settings agent 列表、Doctor 和 cleanup 清单。

### 2. 新增 Reasonix CLI 集成

上游新增 Reasonix Phase 1 state-only 集成：

- `agents/reasonix.js`
- `hooks/reasonix-hook.js`
- `hooks/reasonix-install.js`
- `assets/icons/agents/reasonix.png`
- `assets/source/agent-icons/Reasonix.png`
- registry / integration sync / cleanup / Doctor / Settings agent order 接入
- 配套测试：`test/reasonix-hook.test.js`

特性：Reasonix 自己处理权限，Clawd 只观察状态。合并时和 CodeWhale 同类处理。

### 3. Linux Wayland 默认转 XWayland

上游新增 `src/linux-ozone.js`，并在 `src/main.js` 文件最前面规划 Linux/Wayland 环境下重启到 `--ozone-platform=x11`。目的是修复 Wayland 下透明窗口定位、拖拽和全局鼠标位置受限问题。

合并关注点：

- 这段逻辑必须在任何 BrowserWindow 创建前执行。
- 当前 fork 的 `main.js` 已经改过第一行 Electron import，增加了 `powerMonitor`，不能被上游版本覆盖。
- 这块和 Feishu/Health Reminder 逻辑不共享状态，但发生在同一文件顶部，属于人工合并热点。

### 4. 终端聚焦增强：tmux / Windows cache / macOS hotkey

上游强化 terminal focus：

- `hooks/shared-process.js` 从进程树中提取 `tmux_socket` / `tmux_client`
- `src/server-route-state.js` 和 `src/server-route-permission.js` 接收并规范化 tmux 字段
- `src/state.js` 持久化 session 的 `tmuxSocket` / `tmuxClient`
- `src/main.js` 和 `src/permission.js` 把 tmux 字段传入 focus entry
- `src/focus.js` 新增 tmux pane/client 切换逻辑，并验证 Windows cached focus target，避免过期 hwnd 聚焦到错误窗口
- macOS permission hotkey 在无法捕获前台 app 时不再强行拉回 terminal

合并关注点：

- `src/permission.js` 当前 fork 已经从 Telegram 单通道改成 remote approval provider fanout，不能被上游的旧 Telegram-only 路径覆盖。
- 只应把上游的 `tmuxSocket/tmuxClient` 字段和 macOS hotkey 行为补进当前 fork 的 remote-approval 结构。

### 5. 拖文件夹到桌宠打开终端

上游新增 Windows/Linux 文件夹 drop 能力：

- `src/hit-renderer.js` 注册 dragover/drop
- `src/preload-hit.js` 使用 Electron `webUtils.getPathForFile`
- `src/pet-interaction-ipc.js` 接收 `pet-drop-paths`
- `src/launch-claude.js` 新增 `openTerminalAt()` / `buildShellTerminalCandidates()`
- `src/main.js` 给 `registerPetInteractionIpc` 注入 `statPath`、`openTerminalAt`、`dropLog`

合并关注点：

- macOS 路径刻意禁用，不要改成三平台全开。
- 当前 fork 的 `main.js` 还要保留 Health Reminder bubble 与 Feishu runtime 接线。
- `pet-interaction-ipc.js` 上游还把拖拽结束后立即 `flushRuntimeStateToPrefs()`，关联 Windows 重启位置持久化修复。

### 6. Windows 位置持久化修复

上游在 `src/pet-window-runtime.js` 里监听 Windows `query-session-end` / `session-end`，退出前 flush runtime prefs；`src/pet-interaction-ipc.js` 在拖拽落点应用后也 flush。目的是修复 Windows 重启后桌宠位置不恢复。

这不直接碰 Expand_function，但会通过 `src/main.js` 注入依赖。

### 7. Mobile Companion token rotation M2

上游修改 `src/network/mobile-preview-server.js`：

- token state 增加 `rotationPending`
- 无在线客户端时延迟 24h token rotation
- 下次客户端上线后再轮换并发 grace token
- 持久化失败时重试，避免内存状态与磁盘状态不一致

合并关注点较低，主要跑 `test/mobile-preview-server.test.js`。

### 8. Telegram 审批卡状态回写

上游修改 `src/telegram-native-client.js` / `src/telegram-native-runner.js`：

- 新增 `editMessageText`
- Telegram button 决策先同步 claim，再异步回写卡片状态，避免 timeout/abort 竞争导致真实 Allow/Deny 丢失
- 桌面端/其他渠道已解决、超时、session 停止时，Telegram 卡片会显示中性结果并移除按钮

合并关注点：

- 当前 fork 的 Feishu 远程审批走 `src/remote-approval/` provider fanout，与 Telegram runner 不同文件，理论上可直接吸收。
- 需要回归远程审批：Telegram 单通道、Feishu 单通道、Telegram+Feishu 同开时 first decision wins。

### 9. Doctor / on-demand integration / packaging 修复

上游补充：

- Doctor：全部 info-level integration 不再汇总成 critical
- Settings Doctor 文案新增 `No active integrations` 和 no-activity hint
- `package.json` 增加 CodeWhale / Reasonix install scripts
- `asarUnpack` 增加 `agents/**/*`，修复 packaged hook script `MODULE_NOT_FOUND`
- `hooks/cleanup-integrations.js` 纳入 CodeWhale / Reasonix

合并关注点：

- 当前 fork `package.json` 已新增 `@larksuiteoapi/node-sdk`，合并时必须保留。
- 当前 fork `src/settings-i18n.js` 已加入 Feishu 和 Health Reminder 文案，合并上游 Doctor 文案时不能丢失五语 key。

## Expand_function 保护边界

当前 fork 的二开功能主要分两组。

### Feishu / Lark Remote Approval

必须保留：

- `src/feishu-approval-main.js`
- `src/feishu-approval-runner.js`
- `src/feishu-approval-runtime-status.js`
- `src/feishu-approval-settings.js`
- `src/feishu-card-builder.js`
- `src/remote-approval/`
- `src/remote-approval-broker.js`
- `src/settings-tab-telegram-approval.js` 中的 Feishu channel UI
- `src/main.js` 中 Feishu runtime、provider registry、completion notifier、Doctor helper wiring
- `src/permission.js` 中 remote approval provider fanout
- `src/prefs.js` 中 `feishuApproval` schema，默认 off，凭据不进 prefs
- `src/settings-actions.js` 中 `feishuApproval.*` commands
- `package.json` / `package-lock.json` 中 `@larksuiteoapi/node-sdk`
- Feishu 相关测试和 fake channel

原则：Feishu 只能是可选 provider，默认关闭；不能改变 local permission bubble、Telegram、DND 的既有 fallback 语义。

### Health Reminder

必须保留：

- `src/health-reminder/`
- `src/health-reminder-main.js`
- `src/health-reminder-settings.js`
- `src/health-reminder-bubble.js`
- `src/settings-tab-health-reminder.js`
- `src/preload-health-bubble.js`
- `pwa/health-bubble.html`
- `assets/svg/clawd-health-*.svg`
- `themes/{clawd,cloudling,calico}/theme.json` 的 `healthReminders`
- `src/main.js` 中 Health Reminder runtime 初始化、IPC、bubble controller、`powerMonitor` 依赖
- `src/preload.js` / `src/renderer.js` 中健康动画 IPC
- Settings animation override 的 health section
- Health Reminder 测试集

原则：默认关闭；启用前无后台成本；身体动画只在 idle 播放；任务气泡和权限气泡语义不能被健康提醒改变。

## 预计冲突等级

高风险：

- `src/main.js`：上游 XWayland、tmux focus、drop-folder、Windows flush 与 fork Feishu/Health Reminder 都在同一文件。
- `src/permission.js`：上游小改 tmux/hotkey，但 fork 有 remote provider fanout。必须保留 fork 结构。
- `src/prefs.js`：上游新增 CodeWhale/Reasonix agent 默认值；fork 已把 prefs version 升到 12 并加 Feishu/Health schema。不能降级。
- `src/settings-actions.js`：上游新增 cleanup agent IDs；fork 有 Feishu/Health command registry。只做加法。
- `src/settings-i18n.js`：上游新增 Doctor 文案和 contributors；fork 有 Feishu/Health 五语文案。必须保持 key parity。
- `package.json` / `package-lock.json`：上游版本、scripts、asarUnpack 与 fork Lark SDK 依赖要合并。

中风险：

- `src/state.js`、`src/server-route-state.js`、`src/server-route-permission.js`、`hooks/shared-process.js`：上游 tmux 字段链路，需确认不会破坏 Feishu remote approval payload。
- `src/pet-interaction-ipc.js`、`src/launch-claude.js`、`src/hit-renderer.js`、`src/preload-hit.js`、`src/pet-window-runtime.js`：drop-folder 和 Windows 位置持久化，主要需要测试 Electron IPC 形状。
- `src/network/mobile-preview-server.js`、`src/telegram-native-runner.js`：逻辑独立，但要跑对应 tests。

低风险：

- 新 agent 文件、icons、docs、CI、新测试文件。
- release v0.10.0 文档。

## 结论

本次上游合并适合采用“先做安全快照，再执行一次真实 upstream merge，冲突文件人工三方合并”的方式，不建议在当前 dirty worktree 上直接 `git merge`。

核心策略：

1. 先保护当前二开状态，尤其是 untracked 的 Feishu/Health Reminder 文件。
2. 以上游行为为底座吸收平台、agent、focus、mobile、Telegram 修复。
3. 在少数热点文件中以最小接入点重接 Feishu 和 Health Reminder。
4. 通过 Feishu/Health Reminder 聚焦测试 + 上游新增测试 + 全量 `npm test` 验证。

在得到明确同意前，不应修改源码、不应执行 merge、不应创建/删除/重置分支。
