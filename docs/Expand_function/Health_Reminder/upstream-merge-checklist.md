# 健康提醒 · 上游合并检查清单

> 用于将原作者（上游 Clawd）的后续更新合并回本 fork 时，安全地保留健康提醒功能。
> 与[飞书审批的合并清单](../feishu/upstream-merge-checklist.md)同一套思路：先保上游行为，
> 再用最小接入点重接 fork 功能。
> 日期：2026-06-15

## 合并原则

- **先保上游，再重接 fork**：优先让上游行为复原，再通过最小接入点重新挂上健康提醒。
- **保持默认关闭**：`healthReminder.enabled` 合并后仍须默认 `false`。
- **不改变上游气泡/状态机/反应语义**：除非冲突确实落在这些区域。
- **fork 专属逻辑集中**：尽量保持在 `src/health-reminder/` 与 `health-reminder-*.js`、
  独立气泡窗口文件内，避免散入上游热点文件。

## 预期冲突热点（合并后优先看这些）

上游热点文件（健康提醒在此只有小接入点）：

- `src/prefs.js`
- `src/settings-actions.js`
- `src/main.js`
- `src/settings-renderer.js`
- `src/settings-i18n.js`
- `src/settings-animation-overrides-main.js`
- `src/settings-tab-anim-overrides.js`
- `src/renderer.js`
- `themes/clawd/theme.json`、`themes/cloudling/theme.json`、`themes/calico/theme.json`

fork 自有文件（基本不冲突，缺失即说明被覆盖，需找回）：

- `src/health-reminder/`（reminder-model / scheduler / quiet-hours / gate）
- `src/health-reminder-main.js`、`src/health-reminder-settings.js`
- `src/health-reminder-bubble.js`、`src/preload-health-bubble.js`、`src/health-bubble-renderer.js`、`pwa/health-bubble.html`
- `src/settings-tab-health-reminder.js`
- `themes/*/assets/*-health-*.svg`

## 合并前快照

```bash
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

跑健康提醒聚焦套件（实现后按实际文件名补全）：

```bash
node --test test\health-reminder-model.test.js test\health-reminder-scheduler.test.js test\health-reminder-quiet-hours.test.js test\health-reminder-gate.test.js test\health-reminder-settings.test.js test\health-reminder-main.test.js test\prefs.test.js test\settings-actions.test.js test\settings-renderer-browser-env.test.js
```

时间允许则跑全量：`npm test`。

## 冲突解决顺序

1. `src/prefs.js`：保留 `healthReminder` schema 与默认值；保留主题覆盖 map 的 `healthReminders` 键
   与 `normalizeHealthReminderOverridesMap`；确认默认 `enabled:false`、凭据无关。
2. `src/settings-actions.js`：保留 `healthReminder.*` 命令，且仍走 controller→store。
3. `src/settings-animation-overrides-main.js` / `settings-tab-anim-overrides.js`：重接 `health` 分区与
   `buildHealthReminderCards`；上游若重排分区，按上游结构重新 `pushSection(...,"health",...)`。
4. `src/renderer.js`：重接 `playHealthReminderAnimation` 与 `onPlayHealthReminder`；
   保留上游 `playReaction`/「状态变化取消覆盖层」语义不变。
5. `src/main.js`：用一个窄块重接健康提醒运行时初始化与 IPC；不要扩散到上游生命周期大段。
6. `src/settings-renderer.js`：在 `mobile` 与 `about` 之间重插 healthReminder Tab；保上游侧栏结构。
7. `src/settings-i18n.js`：重接 `sidebarHealthReminder` 等五语文案。
8. `themes/*/theme.json`：保留各主题 `healthReminders` 块；上游若改 viewBox/布局，核对健康动画基线。

## 临时禁用以定位回归

诊断合并回归时，先证明是否健康提醒特有：

```txt
healthReminder.enabled=false
```

重启 Clawd 后预期：

- 不创建任何健康提醒定时器与气泡窗口。
- 不发送 `play-health-reminder` IPC、不播健康身体动画。
- permission/notification/update 气泡、反应动画、状态机、DND、审批、远程 SSH 行为均不变。

若禁用后 bug 消失 → 查 `health-reminder-main.js` / `health-reminder-bubble.js` /
`src/health-reminder/*` / `renderer.js` 接入点。若禁用后仍在 → 当作上游/共享问题先处理。

## 合并后必跑回归

先聚焦套件（同上），再 `npm test`。若全量过慢/超时，至少跑：

```bash
node --test test\state.test.js test\prefs.test.js test\settings-actions.test.js test\menu.test.js test\tick.test.js
```

## 合并后手动冒烟

- 健康提醒禁用：启动→无健康定时器/窗口；现有气泡与反应正常。
- 启用一条 interval 提醒（1 分钟）：空闲→身体动画+气泡；运行任务→只气泡堆在任务下方、不打断；
  忙转闲→补播一次。
- 「知道了」「稍后再提醒」结算正确，不影响任务气泡。
- DND/静默时段内不提醒。
- 「动画/音效替换 → 健康提醒动画」可替换/重置并生效。

## 终检

- `git diff --check`
- 健康提醒新增代码仍主要落在 `src/health-reminder/` 与独立气泡/Tab 文件内。
- 对上游热点文件的改动均为小接入点且有测试覆盖。
- 文档与实际接入点一致（如有偏差，更新本清单）。

## v1 实际接入点（2026-06-15，合并时逐处核对）

新增文件（fork 自有，基本不冲突）：

- `src/health-reminder/`（time / quiet-hours / reminder-model / scheduler / gate）
- `src/health-reminder-settings.js`、`src/health-reminder-main.js`、`src/health-reminder-bubble.js`
- `src/preload-health-bubble.js`、`pwa/health-bubble.html`
- `src/settings-tab-health-reminder.js`
- `themes/clawd/assets/clawd-health-{drink,stretch,eat,offwork,eyerest}.svg`
- `test/health-reminder-*.test.js`

上游热点文件的接入点（合并冲突时按此复原）：

- `src/prefs.js`：`healthReminder` schema（默认 off）；`normalizeThemeOverrides` 的保留键集合加入
  `healthReminders` + 调用 `normalizeHealthReminderOverridesMap`。
- `src/settings-actions.js`：require `./health-reminder-settings`；commandRegistry 注册 9 个
  `healthReminder.*`；函数定义紧邻 `const commandRegistry = {` 之前。
  **并且**在 `updateRegistry` 中注册 `healthReminder: requirePlainObject("healthReminder")`
  ——控制器提交路径用 updateRegistry 作为提交键白名单，缺失会导致保存报
  `commit: unknown settings key healthReminder`（见 BUG-001）。
- `src/settings-actions-theme-overrides.js`：`THEME_OVERRIDE_RESERVED_KEYS` 加 `healthReminders`；
  `cloneHealthReminderOverrides`；`buildThemeOverrideMap` 形参/输出 + **三处**调用都传 `healthReminders`；
  `setAnimationOverride` slotType 允许 `healthReminder` 且 else 分支拆成 reaction/health。
- `src/theme-variants.js`：`applyUserOverridesPatch` 在 reactions 分支后新增 healthReminders 分支。
- `src/settings-animation-overrides-main.js`：`buildHealthReminderCards` + `pushSection("health")`；
  后处理 hitbox 循环 `if (section.id === "reactions" || section.id === "health") continue;`。
- `src/settings-tab-anim-overrides.js`：`getAnimOverrideSectionTitle` 的 `health` 分支；
  `getAnimOverrideTriggerLabel` 的 `health-*` 分支。
- `src/settings-i18n.js`：五语 `animOverridesSectionHealth` + `animHealth*` + `sidebarHealthReminder`
  （注意 `i18n.test.js` 校验五语 key parity——增删 key 必须五语同步）。
- `src/settings-renderer.js`：`SIDEBAR_TABS` 在 `mobile` 与 `about` 间插入 `healthReminder`；
  init 调 `ClawdSettingsTabHealthReminder.init(core)`。
- `src/settings.html`：`settings-tab-health-reminder.js` 须在 `settings-renderer.js` 之前引入。
- `src/settings.css`：尾部 `.hr-*` 样式块。
- `src/renderer.js` / `src/preload.js`：`onPlayHealthReminder` → `playReaction`。
- `src/main.js`：`createSettingsController` 注入 `triggerHealthReminderTest`；`const sessions =
  _state.sessions;` 之后的健康提醒接线块（整体 try/catch）。
- `themes/{clawd,cloudling,calico}/theme.json`：`healthReminders` 块（与 `reactions` 平行）。

> 临时禁用排查：`healthReminder.enabled=false`（或主开关关闭）后重启，应无任何健康提醒定时器/
> 气泡窗口/IPC，且 permission 气泡、反应动画、状态机、审批均不变。

## v2 实际接入点（2026-06-15，合并时逐处核对）

> 详见 [v2 实施日志](health-reminder-v2-phase1-8-log.md)。v2 全为增量，默认关闭项关 == v1。

新增文件（fork 自有，基本不冲突）：

- `src/health-reminder/animation-keys.js`（动画键单一事实源）、`presets.js`（模板）、`stats.js`（统计纯计数）。
- `assets/svg/clawd-health-{breathe,posture,walk,snack,sleeptime}.svg`（clawd 新键素材）。
- `test/health-reminder-{theme-assets,clawd-svgs,anim-i18n,presets-io,presets-commands,sound,smart-scheduling,smart-runtime,bubble,stats}.test.js`。

上游热点文件的 v2 接入点（合并冲突时按此复原）：

- `src/health-reminder/reminder-model.js`：`normalizeConfig` 新增默认安全字段
  `onlyWhenActive` / `adaptiveInterval` / `deferPastQuietHours`（默认 false）、
  `maxVisibleBubbles`（默认 3、clamp[1,5]）、`statsEnabled`（false）+ `stats`（`normalizeStats`）、
  `reduceMotion`（false）；require `./stats`。
- `src/health-reminder/scheduler.js`：`adaptiveIntervalMinutes`、`deferPastQuietHours`（require `./quiet-hours`、`hhMmToMinutes`）。
- `src/health-reminder/gate.js`：`shouldFire` 增 `onlyWhenActive && userActive===false` 抑制分支。
- `src/health-reminder-settings.js`：`exportReminders` / `importReminders`（+ `PORTABLE_KIND/VERSION`）。
- `src/health-reminder-main.js`：注入依赖 `playSound` / `isUserActive` / `recordStat`；`effectiveReminder`
  + `deferPastQuietHours` 接入 `scheduleReminder`；`gateContext` 增 onlyWhenActive/userActive；
  `snoozeStreak`；共享 `confirmReminder` + `dismissAllOpen`；`present()` 的 `reduceMotion` 与 sound 分支；
  fire/confirm/snooze 处 `statsEnabled` 计数。
- `src/health-reminder-bubble.js`：`MAX_VISIBLE` 改为注入 `getMaxVisible` 依赖。
- `src/settings-actions.js`：require `./health-reminder/presets` 与 `./health-reminder/stats`；
  新增命令 `addFromTemplate` / `exportReminders` / `importReminders` / `setSmartOptions` /
  `setMaxVisibleBubbles` / `dismissAll` / `setStatsEnabled` / `clearStats` / `recordStat`
  （commit `healthReminder` 的命令仍依赖 updateRegistry 已注册的 `healthReminder` 键——见 BUG-001）。
- `src/main.js`：electron 解构增 `powerMonitor`；运行时依赖增 `playSound` / `isUserActive`
  （powerMonitor 空闲<120s）/ `recordStat`（转发命令）；气泡控制器 `getMaxVisible`；
  IPC `health-bubble:dismiss-all`；控制器依赖 `dismissAllHealthReminders`。
- `src/settings-i18n.js`：五语 `animHealth{Breathe,Posture,Walk,Snack,Sleeptime}`（i18n.test.js parity）。
- `src/settings-tab-anim-overrides.js`：`health-{breathe,posture,walk,snack,sleeptime}` 触发标签分支。
- `src/settings-tab-health-reminder.js`：`ANIMATION_KEYS` 扩 10 键、`TEMPLATES`、`SOUND_OPTIONS`；
  模板/导入导出/音效/智能调度/最多气泡/全部知道了/统计/减少动态 UI（沿用本地 zh/en）。
- `themes/{clawd,cloudling,calico}/theme.json`：`healthReminders` 各 10 键；cloudling/calico 语义回退映射。

> 注：健康提醒 Tab 仍刻意用本地 zh/en 双语（v1 既定 fork 友好取舍），五语 parity 由侧栏 +
> `animHealth*` + 气泡 `HEALTH_BUBBLE_LABELS` 承担。

## v3 实际接入点（2026-06-17）——屏幕内定位 + 任务优先 + 3D 卡片

> 详见 `health-reminder-v3-*` 文档。

新增文件（fork 自有）：

- `src/health-reminder/bubble-layout.js`（纯几何 `computeHealthStackLayout`：工作区四边夹回 +
  向上生长 + followPet 不遮挡 + 超量隐藏最旧）。
- `test/health-reminder-bubble-layout.test.js`。

上游热点/已有文件的 v3 接入点（合并冲突时按此复原）：

- `src/health-reminder-bubble.js`：`layout()` 改为调 `computeHealthStackLayout`；注入
  `getMode`/`getWorkArea`/`getPetHitRect`（替代 v1 `getAnchorRect`）；堆叠反转（新在下、旧上推）。
- `src/health-reminder/reminder-model.js`：`normalizeConfig` 新增 `displayMode`（默认 `followPet`，另 `corner`）。
- `src/health-reminder-main.js`：**任务优先（⚠️ 推翻 v1 决策 #1）**——注入 `hasActiveTaskBubble`、
  新增 `deferredQueue` 与 `onTaskActive()/onTaskCleared()`；`fire` 在任务在场时入队不显示；
  被让位的提醒不计 confirm/snooze、不动计时器，任务清空后补显示。
- `src/main.js`：健康控制器注入 `getMode`/`getWorkArea`(`getNearestWorkArea`)/`getPetHitRect`(`getHitRectScreen`)；
  运行时注入 `hasActiveTaskBubble: () => pendingPermissions.length>0`；`onPermissionsChanged` 在
  `pendingPermissions` 0↔>0 边沿驱动 `onTaskActive/onTaskCleared`（模块级 `_lastTaskBubbleActive`）；
  宠物 `move`/`resize` 事件附带 `_healthBubbleController.reposition()`。
- `pwa/health-bubble.html`：3D 半透明渐变样式 + `reportHeight` 偏移 `+18`（结构未变）。

回归：全量 `node test/run-tests.js` = 4233 用例，4220 通过，唯一失败为既有遗留
`agent installation detector › treats a bare Hermes home directory as low-confidence residue`
（与本次无关）。

余项（纯展示层，未做）：健康 Tab「显示模式」选择器 + 主开关置顶醒目化（+可选托盘开关）。
