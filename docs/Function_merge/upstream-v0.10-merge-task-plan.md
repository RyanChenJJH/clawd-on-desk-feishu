# 原作者更新合并任务计划

日期：2026-06-16

目标：把原作者仓库 `10f4cd1` 的更新合并到当前 `clawd-on-desk-feishu` fork，同时不破坏 `docs/Expand_function` 中的 Feishu/Lark 远程审批和 Health Reminder 二开功能。

## 总体原则

1. 未经确认，不动源码、不执行 merge。
2. 不在 dirty worktree 上直接合并。
3. 不使用 `git reset --hard`、`git checkout --` 等会覆盖当前二开成果的命令。
4. 先保上游行为，再用最小接入点重接 fork 功能。
5. Feishu 和 Health Reminder 必须保持默认关闭。
6. 任何远程审批失败都不能自动 allow/deny；local permission bubble 仍是 fallback。
7. Health Reminder 不能打断任务动画、权限气泡、DND、update bubble、Session HUD。

## Phase 0：合并前安全快照

需要用户同意后执行。

1. 记录当前状态：

```bash
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

2. 处理当前大量未提交二开文件。推荐方案是创建本地 merge 分支并做一次 WIP 快照提交，便于真实三方 merge 和回滚：

```bash
git switch -c codex/upstream-v0.10-merge
git add -A
git commit -m "chore: snapshot fork extensions before upstream merge"
```

说明：

- 如果不希望产生 WIP commit，也可以改用 stash，但当前有大量 untracked 文件，stash 更容易漏掉被 ignore 的文档或素材。
- 如果要把 `docs/Expand_function` / `docs/Function_merge` 这类被 `.gitignore` 忽略的文档纳入快照，需要显式 `git add -f`，这一步需单独确认。

3. 跑合并前 focused baseline。若失败，先记录失败，不急着修：

```bash
node --test test\remote-approval-broker.test.js test\remote-approval-provider-registry.test.js test\remote-approval-payload.test.js test\remote-approval-status.test.js test\permission-telegram-approval.test.js test\completion-notify-integration.test.js test\feishu-card-builder.test.js test\feishu-approval-settings.test.js test\feishu-approval-runner.test.js test\feishu-approval-main.test.js test\feishu-approval-runtime-status.test.js test\doctor.test.js test\doctor-ipc.test.js test\doctor-report.test.js test\settings-renderer-browser-env.test.js
```

```bash
node --test test\health-reminder-model.test.js test\health-reminder-scheduler.test.js test\health-reminder-quiet-hours.test.js test\health-reminder-gate.test.js test\health-reminder-settings.test.js test\health-reminder-main.test.js test\health-reminder-bubble.test.js test\health-reminder-tab.test.js test\health-reminder-prefs.test.js test\health-reminder-theme-assets.test.js test\health-reminder-clawd-svgs.test.js test\health-reminder-presets-commands.test.js test\health-reminder-presets-io.test.js test\health-reminder-smart-scheduling.test.js test\health-reminder-smart-runtime.test.js test\health-reminder-sound.test.js test\health-reminder-stats.test.js test\prefs.test.js test\settings-actions.test.js test\settings-renderer-browser-env.test.js
```

## Phase 1：引入上游本地仓库

1. 添加或更新本地 upstream remote。

```bash
git remote add upstream-local E:/Work2/AI_Work/tool/clawd-on-desk/clawd-on-desk/clawd-on-desk
```

如果 remote 已存在，则改用：

```bash
git remote set-url upstream-local E:/Work2/AI_Work/tool/clawd-on-desk/clawd-on-desk/clawd-on-desk
```

2. 拉取上游本地 main。

注意：从当前 sandbox 跨目录读取上游 git 时可能触发 Git `safe.directory` 检查。优先用单次命令参数，不改全局配置：

```bash
git -c safe.directory=E:/Work2/AI_Work/tool/clawd-on-desk/clawd-on-desk/clawd-on-desk fetch upstream-local main
```

3. 执行 merge：

```bash
git merge --no-ff upstream-local/main
```

如出现冲突，进入 Phase 2。不要用接受整边的方式处理热点文件。

## Phase 2：冲突处理顺序

### 2.1 package 文件

文件：

- `package.json`
- `package-lock.json`

合并规则：

- 保留 fork 的 `@larksuiteoapi/node-sdk`。
- 加入上游 `install:codewhale-hooks`、`uninstall:codewhale-hooks`、`install:reasonix-hooks`、`uninstall:reasonix-hooks`。
- 加入上游 `asarUnpack` 的 `agents/**/*`。
- 版本号策略需确认：默认建议跟随上游 `0.10.0`，如果 fork 需要独立版本，可另行改成 fork 版本号，但不要混乱 package-lock root version。

### 2.2 新 agent 集成

文件：

- `agents/codewhale.js`
- `agents/reasonix.js`
- `hooks/codewhale-hook.js`
- `hooks/codewhale-install.js`
- `hooks/reasonix-hook.js`
- `hooks/reasonix-install.js`
- `assets/icons/agents/codewhale.png`
- `assets/icons/agents/reasonix.png`
- `assets/source/agent-icons/Reasonix.png`
- `docs/guides/codewhale-setup.md`
- 对 registry / sync / cleanup / Doctor / Settings agent order 的接入文件

合并规则：

- 原样吸收上游 state-only 行为。
- `prefs` 中新增 agent 默认值时，保持 `integrationInstalled:false`、`enabled:false`。
- 不给 CodeWhale / Reasonix 打开 permission bubble。
- Doctor 和 cleanup 清单只做加法。

### 2.3 `src/main.js`

必须人工合并。

保留 fork：

- Feishu settings/runtime/provider registry/completion notifier/status wiring
- Health Reminder runtime、bubble controller、IPC、`powerMonitor`、`triggerHealthReminderTest`
- `getRemoteApprovalClients`
- `feishuApproval` settings subscription/startup/shutdown

吸收上游：

- 文件顶部 Linux XWayland relaunch，且必须在创建窗口前执行
- `openTerminalAt` import
- `getPendingPermissionFocusEntry` / `focusTerminalSession` 传递 `tmuxSocket` / `tmuxClient`
- `registerPetInteractionIpc` 注入：
  - `flushRuntimeStateToPrefs`
  - `statPath`
  - `openTerminalAt`
  - `dropLog`

检查点：

- 第一行 Electron import 同时包含 `powerMonitor` 和上游需要的字段。
- 不要删掉 Feishu startup sync、Feishu shutdown stop。
- 不要移动 Health Reminder 到会影响 app ready/window lifecycle 的位置。

### 2.4 `src/permission.js`

必须人工合并。

保留 fork：

- `startRemoteApprovalFanout`
- provider registry
- Feishu + Telegram first decision wins
- remote suggestion payload helper
- `getRemoteApprovalClients`

吸收上游：

- `buildPermissionFocusEntry` 中加入 `tmuxSocket` / `tmuxClient`
- macOS hotkey fallback 改为“无法捕获前台 app 时保持当前焦点”，不要再拉回 terminal

检查点：

- 不要退回上游旧的 Telegram-only remote approval 逻辑。
- DND、abort、timeout、local bubble 决策语义保持不变。

### 2.5 prefs / settings actions / i18n

文件：

- `src/prefs.js`
- `src/settings-actions.js`
- `src/settings-i18n.js`
- `test/prefs.test.js`
- `test/settings-actions.test.js`

合并规则：

- `src/prefs.js`
  - 保留 `CURRENT_VERSION = 12` 或按 fork 版本迁移策略向上递增，不能降回上游 v11。
  - 保留 `feishuApproval` schema 和 `healthReminder` schema。
  - 新增 `codewhale`、`reasonix` agent 默认值。
  - 保留 `healthReminders` theme override normalize。
- `src/settings-actions.js`
  - 保留 `feishuApproval.*` commands。
  - 保留全部 `healthReminder.*` commands。
  - 在 cleanup/managed agent 列表中加入 `codewhale`、`reasonix`。
- `src/settings-i18n.js`
  - 保留 Feishu 和 Health Reminder 五语文案。
  - 加入上游 `doctorAgentSummaryNoneActive` 和 `doctorConnectionNoActivityHint` 五语文案。
  - 加入上游 contributors，但不要覆盖 fork 已有维护者/贡献者策略。

### 2.6 tmux focus 链路

文件：

- `hooks/shared-process.js`
- `src/server-route-state.js`
- `src/server-route-permission.js`
- `src/state.js`
- `src/focus.js`
- 相关 tests

合并规则：

- 原样吸收 `tmux_socket` / `tmux_client` 字段规范化和传递。
- `state.js` 中新增字段时，保留当前 fork 的 notification gate、completion、remote approval 相关逻辑。
- `focus.js` 可优先接受上游，因为当前 fork未显示该文件有 dirty 改动。

### 2.7 drop-folder / Windows position / mobile / Telegram

文件：

- `src/hit-renderer.js`
- `src/preload-hit.js`
- `src/pet-interaction-ipc.js`
- `src/pet-window-runtime.js`
- `src/launch-claude.js`
- `src/network/mobile-preview-server.js`
- `src/telegram-native-client.js`
- `src/telegram-native-runner.js`

合并规则：

- macOS drop path 保持禁用。
- `pet-interaction-ipc.js` 新增 `flushRuntimeStateToPrefs` 是必需依赖，`main.js` 必须同步注入。
- Telegram runner 的 card outcome rewrite 可直接吸收，但要跑远程审批回归。

### 2.8 docs 和 release

文件：

- `docs/releases/release-v0.10.0.md`
- `docs/project/release-process.md`
- `docs/guides/*`
- README 多语言文件

合并规则：

- 上游 v0.10 release notes 可加入。
- 当前 fork 的 `docs/releases/release-v0.9.0.md` 已记录 Feishu/Health 相关内容，不应被删除。
- Setup / known limitations 中既要保留 Feishu/Health 内容，也要加入 CodeWhale/Reasonix/Linux/drag-folder 等上游说明。

## Phase 3：合并后自动化测试

先跑冲突热点和 Expand_function focused suite：

```bash
node --test test\prefs.test.js test\settings-actions.test.js test\settings-renderer-browser-env.test.js test\permission-telegram-approval.test.js test\completion-notify-integration.test.js
```

Feishu focused suite：

```bash
node --test test\remote-approval-broker.test.js test\remote-approval-provider-registry.test.js test\remote-approval-payload.test.js test\remote-approval-status.test.js test\feishu-card-builder.test.js test\feishu-approval-settings.test.js test\feishu-approval-runner.test.js test\feishu-approval-main.test.js test\feishu-approval-runtime-status.test.js test\feishu-approval-main-wiring.test.js test\feishu-upstream-merge-checklist.test.js
```

Health Reminder focused suite：

```bash
node --test test\health-reminder-model.test.js test\health-reminder-scheduler.test.js test\health-reminder-quiet-hours.test.js test\health-reminder-gate.test.js test\health-reminder-settings.test.js test\health-reminder-main.test.js test\health-reminder-bubble.test.js test\health-reminder-tab.test.js test\health-reminder-prefs.test.js test\health-reminder-theme-assets.test.js test\health-reminder-clawd-svgs.test.js test\health-reminder-anim-i18n.test.js test\health-reminder-anim-overrides.test.js test\health-reminder-presets-commands.test.js test\health-reminder-presets-io.test.js test\health-reminder-smart-scheduling.test.js test\health-reminder-smart-runtime.test.js test\health-reminder-sound.test.js test\health-reminder-stats.test.js test\health-reminder-time.test.js
```

上游新增/相关 focused suite：

```bash
node --test test\codewhale-hook.test.js test\codewhale-install.test.js test\reasonix-hook.test.js test\linux-ozone.test.js test\focus-tmux.test.js test\focus-windows.test.js test\permission-hotkey-focus.test.js test\pet-interaction-ipc.test.js test\pet-window-runtime.test.js test\hit-renderer.test.js test\launch-claude.test.js test\mobile-preview-server.test.js test\telegram-native-client.test.js test\telegram-native-runner.test.js test\doctor-agent-descriptors.test.js test\doctor-agent-integrations.test.js test\doctor-modal-no-active-integrations.test.js test\integration-sync.test.js test\package-build-config.test.js test\shared-process.test.js
```

最后跑全量：

```bash
npm test
```

如果全量测试在 Windows 本地环境超时，记录超时点，并至少补跑：

```bash
node --test test\state.test.js test\server-route-state.test.js test\server-route-permission.test.js test\server-hook-management.test.js test\agents.test.js test\registry.test.js test\settings-agent-order.test.js test\settings-actions-agents.test.js test\agent-installation-detector.test.js
```

## Phase 4：手动 smoke

Windows 本机优先：

1. 启动 Clawd，确认 Settings 能打开，Agents/Remote Approval/Health Reminder/Animation Replacement tab 都能显示。
2. Feishu disabled：
   - 不启动 Feishu long connection。
   - 本地 permission bubble 正常。
   - Telegram 行为不变。
3. Feishu enabled 私有环境：
   - Send test 不写入真实 secret 到 prefs/log/docs。
   - 只允许配置的 approver 决策。
   - Feishu 和 Telegram 同开时 first decision wins。
4. Health Reminder disabled：
   - 无健康提醒 timer/window。
   - 不发送 `play-health-reminder` IPC。
5. Health Reminder enabled：
   - interval 测试触发气泡。
   - task working 时只显示气泡，不抢身体动画。
   - idle 后补播健康动画。
   - DND/quiet hours 生效。
6. 拖文件夹到桌宠：
   - Windows 打开对应目录的 terminal。
   - mini mode 下不接受 drop。
7. Windows 重启/退出前位置持久化：
   - 拖拽后退出重启，位置恢复。
8. Telegram 审批卡：
   - 桌面端解决后 Telegram card 移除按钮并显示结果。
   - Telegram 点击 Allow/Deny 能同步 claim，不被 timeout 抢掉。
9. Doctor：
   - 全部 info-level integrations 不再显示 critical。
   - 未启用 agent 时显示 no active integrations hint。

Linux/macOS：

- Linux XWayland 逻辑在当前 Windows 环境无法完整手工 QA，只跑 `test/linux-ozone.test.js`，并在最终说明里标注残余风险。
- macOS terminal focus / permission hotkey 只能 code-review-first，不能在当前环境承诺真实 QA。

## Phase 5：最终检查

```bash
git diff --check
git status --short
```

人工检查：

- 没有真实 Feishu/Lark App ID、App Secret、open_id、user_id、chat_id、receive_id、Telegram token、message id。
- `feishuApproval.enabled` 默认仍为 `false`。
- `healthReminder.enabled` 默认仍为 `false`。
- `CodeWhale` / `Reasonix` 默认未安装、未启用、state-only。
- `src/main.js` 中 Feishu/Health 接线仍是窄块，没有扩散重写上游生命周期。
- `src/permission.js` 仍是 provider fanout，不是 Telegram-only。
- 上游新增平台修复和 agent 集成 tests 已通过或失败原因已记录。

## 建议审批口径

若同意本方案，建议明确以下三点后再动工：

1. 是否允许我创建 `codex/upstream-v0.10-merge` 本地分支。
2. 是否允许我把当前二开工作区先做一个本地 WIP 快照提交。
3. 版本号是否跟随上游 `0.10.0`，还是采用 fork 自己的版本号策略。
