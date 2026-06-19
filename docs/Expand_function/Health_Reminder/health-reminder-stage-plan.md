# 健康提醒第一版实施计划（分阶段任务）

> 配套：[开发方案](health-reminder-development-plan.md)。每阶段独立可测、可回滚，按「先纯逻辑、
> 再运行时、最后 UI」推进，保证任一阶段中断都不破坏现有功能。
> 日期：2026-06-15

## 阶段总览

| 阶段 | 主题 | 是否触碰上游热点文件 | 产出 |
| --- | --- | --- | --- |
| P0 | 分支与脚手架 | 否 | feature 分支、空模块、占位测试 |
| P1 | 纯逻辑层 | 否 | model / scheduler / quiet-hours / gate + 单测 |
| P2 | prefs + settings-actions | 是（小） | `healthReminder` schema + 命令 + 单测 |
| P3 | 主题块 + 动画替换分区 | 是（小） | `healthReminders` 主题块、health 分区、替换生效 |
| P4 | clawd 动画素材 | 否 | 5 个 clawd-health-*.svg（见动画规范） |
| P5 | 运行时编排 + 渲染层 | 是（小） | health-reminder-main、气泡窗口、身体动画 IPC |
| P6 | 设置 Tab UI | 是（小） | 「健康提醒」Tab + i18n |
| P7 | 文档 / QA / 回归 | 否 | setup/known-limitations/release note、手动 QA |

---

## P0 — 分支与脚手架

任务：
- [ ] 新建 feature 分支（如 `feature/health-reminder`）。
- [ ] 建目录 `src/health-reminder/`，落空文件（model/scheduler/quiet-hours/gate）。
- [ ] 建占位测试文件，确保 `node --test` 能发现并通过空套件。

涉及文件：仅新增。

验收：`npm test` 通过；现有行为零变化。

---

## P1 — 纯逻辑层（无 Electron 依赖）

任务：
- [ ] `reminder-model.js`：
  - `normalizeReminder(def)` / `validateReminder(def)`：补默认、裁剪非法字段、生成稳定 id。
  - `normalizeConfig(cfg)`：顶层 `healthReminder`（enabled/respectDnd/quietHours/autoCollapseMinutes/reminders）。
- [ ] `scheduler.js`：
  - `computeNextFire(reminder, fromTs, { lastFiredTs })`：interval 与 daily(多时刻) + weekday 过滤；
    返回下一个绝对时间戳（wall-clock）。
  - 处理跨午夜、月末、夏令时；interval 支持「自上次触发起算」。
- [ ] `quiet-hours.js`：
  - `isWithinQuietHours(now, quietHours)`：支持 `start>end` 跨午夜。
- [ ] `gate.js`：
  - `shouldFire(now, { dnd, quietHours, respectDnd })`：DND/静默 → false。
  - `canPlayBodyAnimation(displayState)`：仅 idle/sleeping 等非任务态返回 true。

测试：
- `test/health-reminder-model.test.js`
- `test/health-reminder-scheduler.test.js`
- `test/health-reminder-quiet-hours.test.js`
- `test/health-reminder-gate.test.js`

验收：四个纯逻辑模块单测全绿；不引入任何 `require("electron")`。

---

## P2 — prefs + settings-actions（接入点，小改）

任务：
- [ ] `src/prefs.js`：
  - 新增 `healthReminder` 默认 schema（参照 `feishuApproval` L294 的写法与位置）。
  - 主题覆盖 map 允许键加入 `healthReminders`（参照 L819 的 `reactions` 分支）。
  - 新增 `normalizeHealthReminderOverridesMap`（复刻 `normalizeReactionOverridesMap` L721/L849）。
- [ ] `src/health-reminder-settings.js`：包装 prefs 读写、提供给 settings-actions 的纯函数。
- [ ] `src/settings-actions.js`：新增 `healthReminder.*` 命令（add/update/remove/reorder/setEnabled/
  setQuietHours/setRespectDnd/setAutoCollapse/testReminder），全部走 controller→store。

测试：
- 扩展 `test/prefs.test.js`：schema、默认值、`healthReminders` 覆盖 map normalize。
- 扩展 `test/settings-actions.test.js`：各命令的 commit 形状、非法入参拒绝、noop 行为。

验收：命令读写正确；默认 `enabled:false`；现有 prefs/settings-actions 测试不回归。

---

## P3 — 主题块 + 「健康提醒动画」替换分区

任务：
- [ ] `themes/clawd/theme.json`：新增 `healthReminders`（drink/stretch/eat/offwork/eyerest，先引用
  将在 P4 产出的文件名）。
- [ ] `themes/cloudling/theme.json`、`themes/calico/theme.json`：新增 `healthReminders`，`file` 暂指
  各自现有最接近素材（回退）。
- [ ] `src/settings-animation-overrides-main.js`：新增 `buildHealthReminderCards(themeOverrideMap)`
  （复刻 `buildReactionCards` L874）；`pushSection(sections,"health",null,cards)`（参照 L1005）。
- [ ] `src/settings-tab-anim-overrides.js`：`getAnimOverrideSectionTitle("health")`、子标题、
  各 health 键的触发标签；卡片渲染复用既有 slotType 流程。
- [ ] 覆盖应用：`src/settings-anim-overrides-merge.js` 及主题覆盖应用路径纳入 `healthReminders`
  （复刻 `reactions`），确保替换/重置生效。

测试：
- 扩展动画替换主进程测试：health 分区存在、卡片字段正确、`setAnimationOverride` 对 health 生效、重置生效。

验收：「动画/音效替换」出现「健康提醒动画」分区，可预览/替换/重置（此时 clawd 用 P4 素材，
其余用回退素材）。

---

## P4 — clawd 健康动画素材（5 个）

任务：
- [ ] 按[动画设计规范](health-reminder-animation-design-spec.md)绘制：
  - `themes/clawd/assets/clawd-health-drink.svg`
  - `themes/clawd/assets/clawd-health-stretch.svg`
  - `themes/clawd/assets/clawd-health-eat.svg`
  - `themes/clawd/assets/clawd-health-offwork.svg`
  - `themes/clawd/assets/clawd-health-eyerest.svg`
- [ ] 对齐既有 viewBox 与像素风；内置 SMIL/CSS 循环动画；校验单文件可独立加载。

测试：动画为静态资源，主要靠 P3 的替换分区预览 + 手动检视；可加一条「文件存在且为合法 SVG」的轻量校验。

验收：5 个动画在「动画/音效替换」分区与提醒预览中正常播放，风格统一。

---

## P5 — 运行时编排 + 渲染层（接入点，小改）

任务：
- [ ] `src/renderer.js`：新增 `playHealthReminderAnimation(svgFile, durationMs)`（复刻 `playReaction`
  L620）+ `window.electronAPI.onPlayHealthReminder(...)` 监听；复用既有「状态变化取消覆盖层」。
- [ ] `src/health-reminder-bubble.js` + `src/preload-health-bubble.js` + `pwa/health-bubble.html` +
  `src/health-bubble-renderer.js`：独立常驻气泡窗口；展示 message、「知道了」「稍后再提醒」；
  定位在任务气泡下方并支持多条堆叠；confirm/snooze 经 IPC 回传。
- [ ] `src/health-reminder-main.js`：
  - 加载配置；为每条 enabled 提醒用 scheduler 排程；wall-clock tick（对齐）。
  - 到点：过 `gate.shouldFire`；弹气泡；据 `canPlayBodyAnimation(当前状态)` 决定即时播/挂起补播。
  - 监听显示状态变化：忙→闲且有挂起补播且气泡仍开 → 播一次。
  - 处理 confirm（关闭该气泡、重排下次）/ snooze（+snoozeMinutes 重排、关闭气泡）。
  - `autoCollapseMinutes>0` 的无操作自动收起。
- [ ] `src/main.js`：初始化运行时、注册 IPC、把已计算的显示状态喂给运行时（小块）；
  仅在 `healthReminder.enabled` 时启动。

测试：
- `test/health-reminder-main.test.js`（fake renderer/bubble/clock）：覆盖方案 §9 的全部运行时用例。

验收：手动 QA（方案 §9 步骤 1–7）通过；`enabled=false` 时无定时器、无窗口、无 IPC。

---

## P6 — 设置 Tab UI（接入点，小改）

任务：
- [ ] `src/settings-tab-health-reminder.js`：主开关、全局（DND/静默/自动收起）、提醒列表与增删改、
  调度表单、animationKey 下拉、snooze、「测试一次」。
- [ ] `src/settings-renderer.js`：`SIDEBAR_TABS` 在 `mobile` 与 `about` 间插入 healthReminder；`init` 新 Tab。
- [ ] `src/settings-i18n.js`：`sidebarHealthReminder` 与 Tab 文案（en/zh/zh-TW/ko/ja）。
- [ ] settings.css：健康提醒 Tab 与气泡样式（沿用既有 token，不引入新风格）。

测试：
- 扩展 `test/settings-renderer-browser-env.test.js`：侧栏出现该 Tab、CRUD、保存调度/静默、测试按钮。

验收：UI 可视化完成提醒全生命周期管理；五语侧栏文案就位。

---

## P7 — 文档 / QA / 回归

任务：
- [ ] 更新 `docs/guides/setup-guide.md`（及 zh-CN）与 known-limitations（v1 动画范围、桌面限定）。
- [ ] release note 增加健康提醒条目，标注 v1 仅 clawd 动画、其余回退。
- [ ] 跑聚焦回归套件 + `npm test`；记录 Windows 本机手动 QA 结果。
- [ ] 核对[上游合并检查清单](upstream-merge-checklist.md)，补充本次实际接入点。

验收：全部测试通过；文档与 release note 完整；合并清单与代码一致。

---

## 依赖与顺序

- P1 不依赖任何其他阶段，可最先做。
- P3 依赖 P2（覆盖 map normalize）；P4 可与 P1–P3 并行，但 P3 主题块文件名需与 P4 一致。
- P5 依赖 P1（纯逻辑）与 P3/P4（动画可用）。
- P6 依赖 P2（命令）与 P5（运行时可被测试触发）。
- P7 最后。

## 提交粒度建议

每阶段一组小提交，提交信息标注接入点（便于未来 fork 合并按文件回看）。例如：
`feat(health-reminder): add pure scheduler + tests (P1)`、
`feat(health-reminder): wire healthReminder prefs schema (P2, prefs.js integration point)`。
