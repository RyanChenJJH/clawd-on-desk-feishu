# 健康提醒第一版开发方案

> 状态：方案设计阶段。需求澄清已完成，关键决策见 [README](README.md)。本文档只做设计，不代表已开始实现。
> 日期：2026-06-15

## 1. 目标

在桌面宠物 Clawd 中新增「健康提醒」功能：用户可创建若干常用提醒（喝水、久坐起身、午饭、
下班、护眼等），为每条配置触发时间与提醒文字，并选择一个「健康提醒动画」。到点时，宠物在
**不打断任何现有功能**的前提下，以一个**独立、常驻、可交互的气泡**提醒用户，气泡堆叠在
任务气泡下方；当宠物身体空闲时，额外播放对应的萌系身体动画。

第一版**不做**：三主题完整动画（仅 clawd 一组，其余回退）、提醒统计、智能/自适应调度、
移动端提醒、云同步。这些进入 v2（见 [v2 方案](health-reminder-v2-development-plan.md)）。

## 1.1 硬约束（优先级高于实现细节）

- **不可影响和改变现有功能**：任务状态动画、permission/notification/update 气泡、反应动画、
  DND、headless、agent hook、飞书/Telegram 审批、远程 SSH 等行为必须保持完全兼容。
- **功能默认关闭**：未启用健康提醒时，不启动任何定时器、不创建气泡窗口、不改变启动成本，
  与当前版本逐位一致。
- **功能模块化**：健康提醒代码集中在 `src/health-reminder/` 与少数 `health-reminder-*.js`
  文件，主链路只通过小型、稳定的接入点接入。
- **对上游 fork 合并友好**：尽量新增文件、少改现有文件；必须改时改动小而集中、可回滚、
  有测试保护。维护一份《上游合并检查清单》。
- **不绕过现有设置体系**：Settings 仍遵守 `prefs.js → settings-controller.js → settings-store.js`，
  写入 side effects 走 `settings-actions.js`。
- **不改变 agent 协议**：不触碰任何 hook payload / 响应格式。

## 2. 调研结论（代码勘探）

可行。复用现有三套机制即可低风险落地：

1. **「不打断任务」有现成依托**。宠物显示状态由 `src/state-priority.js` 的 `STATE_PRIORITY`
   决定（`error 8 > notification 7 > sweeping 6 > attention 5 > carrying/juggling 4 >
   working 3 > thinking 2 > idle 1 > sleeping 0`）。任务态均来自 agent 会话。可据此判断
   「身体是否被任务占用」，作为身体动画的触发闸门。

2. **身体动画有现成覆盖层机制**。`src/renderer.js:620` 的 `playReaction(svgFile, durationMs)`
   是瞬时身体覆盖层：暂停眼追、`swapToFile`、计时结束后 `resumeFromReaction()`；并且
   `renderer.js:913` 注释表明**主进程状态变化会取消进行中的反应**。健康身体动画复刻该机制，
   并仅在空闲时由主进程触发，因此天然不抢占任务动画。

3. **气泡是独立窗口，可堆叠**。`permission/notification/update` 气泡各为相对宠物定位的
   BrowserWindow（`main.js` 的 `repositionFloatingBubbles()` 等），互不耦合。健康气泡作为
   **独立窗口**堆在任务气泡下方即可满足「共存、互不打断」，且无需改动 `permission.js` 的
   气泡代码——这是对上游最友好的做法。

4. **分组动画 + 可替换分区有现成范例**。`themes/*/theme.json` 的 `reactions` 块定义了一组
   动画；`src/settings-animation-overrides-main.js` 的 `buildReactionCards()` +
   `pushSection(sections,"reactions",...)`（约 L874/L1005）把它渲染成「动画/音效替换」里的
   可替换卡片。新增平行的 `healthReminders` 主题块与 `health` 分区即可。

## 3. 总体架构

健康提醒由三层组成，彼此解耦：

```
┌─────────────────────────────────────────────────────────────┐
│ 设置层 (renderer)                                            │
│  - settings-tab-health-reminder.js   提醒条目 CRUD / 静默时段 │
│  - 「动画/音效替换」新增 "健康提醒动画" 分区（替换 SVG）       │
└───────────────┬─────────────────────────────────────────────┘
                │ settingsAPI.command("healthReminder.*")
┌───────────────▼─────────────────────────────────────────────┐
│ 配置 + 纯逻辑层（可单测，无 Electron 依赖）                   │
│  - health-reminder/reminder-model.js  normalize/validate     │
│  - health-reminder/scheduler.js       下次触发时间计算        │
│  - health-reminder/quiet-hours.js     静默时段判断（跨午夜）  │
│  - health-reminder/gate.js            身体动画可否播放 + 触发闸门 │
│  - health-reminder-settings.js        prefs 读写 normalize    │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│ 运行时层 (main process)                                      │
│  - health-reminder-main.js   定时器 / 到点判定 / 生命周期     │
│  - health-reminder-bubble.js 独立常驻气泡窗口（确认/稍后）    │
│      └─ preload-health-bubble.js + pwa/health-bubble.html     │
│         + health-bubble-renderer.js                          │
│  - 复用 renderer.js 的覆盖层：新增 playHealthReminderAnimation │
└─────────────────────────────────────────────────────────────┘
```

## 4. 数据模型

### 4.1 prefs 顶层字段 `healthReminder`

```js
healthReminder: {
  enabled: false,                  // 主开关；默认 false → 与上游逐位一致
  respectDnd: true,                // DND 开启时不提醒
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "08:00",                  // 支持跨午夜
  },
  autoCollapseMinutes: 0,          // 0 = 永不自动收起气泡
  reminders: [ /* ReminderDef[] */ ],
}
```

### 4.2 单条提醒 `ReminderDef`

```js
{
  id: "hr_xxxxxxxx",               // 稳定 id（新增时生成）
  enabled: true,
  label: "喝水",                   // 设置列表显示名
  message: "该喝水啦 💧 起来接杯水吧",  // 气泡文字
  animationKey: "drink",           // 对应 theme.healthReminders[animationKey]；"none" = 仅文字气泡
  schedule: {
    type: "interval" | "daily",
    intervalMinutes: 45,           // type=interval 时生效（最小 1，建议 ≥5）
    times: ["12:00"],              // type=daily 时生效（可多个 HH:MM）
    days: [1,2,3,4,5],             // 0=周日..6=周六；空数组或全选 = 每天
  },
  snoozeMinutes: 10,               // 「稍后再提醒」间隔，默认 10
  sound: null,                     // 预留；v2 接入音效替换
}
```

设计要点：

- **`animationKey` 与 `theme.healthReminders` 解耦于具体文件**：提醒只引用动画「键」，
  实际 SVG 由主题与「动画/音效替换」决定。换主题或替换素材都不影响提醒配置。
- **`enabled` 双层**：顶层 `healthReminder.enabled` 是主开关；单条 `enabled` 控制单个提醒。
  两者都 false 时零开销。
- **默认随包提醒清单**：随包内置一组合理的默认 `reminders`（见 §7），但主开关默认 **off**，
  用户在设置里一键启用即可，从而既「开箱有内容」又「默认不打扰」。

### 4.3 主题块 `theme.json` 新增 `healthReminders`

与 `reactions` 平行：

```json
"healthReminders": {
  "drink":   { "file": "clawd-health-drink.svg",   "duration": 4000 },
  "stretch": { "file": "clawd-health-stretch.svg", "duration": 4500 },
  "eat":     { "file": "clawd-health-eat.svg",     "duration": 4000 },
  "offwork": { "file": "clawd-health-offwork.svg", "duration": 4000 },
  "eyerest": { "file": "clawd-health-eyerest.svg", "duration": 5000 }
}
```

cloudling/calico 在 v1 也写入该块，但 `file` 暂指向各自最接近的现有素材（如 happy/attention），
保证功能可用；v2 替换为专属手绘动画。

## 5. 不打断设计（核心）

把「提醒」拆成**两个相互独立的输出**：① 文字气泡（共存层）② 身体动画（让位层）。

### 5.1 文字气泡 —— 共存，绝不让位

- 健康气泡是**独立 BrowserWindow**，与任务气泡（permission/notification/update）生命周期完全分离。
- 定位：锚定在任务气泡**下方**（复用现有相对宠物的几何，叠加一个垂直偏移；多条健康提醒
  继续向下堆叠）。任务气泡保持其原有位置与层级，显示在健康气泡**上方**。
- 互不干扰：任务气泡出现/消失不触碰健康气泡；健康气泡的「知道了/稍后」只结算自身。
- 持久：气泡常驻直到用户点「知道了」或「稍后再提醒」；`autoCollapseMinutes>0` 时才在无操作
  超时后自动收起（默认 0 = 不收起）。
- 多条并发：最多同时可见 N=3 条（自上而下按触发时间），其余排队，前一条被处理后补位。

> 因为是独立窗口，「任务提醒不会打断健康提醒、健康提醒也不打断任务」是**结构性保证**，
> 不依赖任何状态判断。

### 5.2 身体动画 —— 仅空闲时播放，忙→闲补播一次

- 到点触发时，`health-reminder-main` 读取当前主导显示状态（它已可获取会话状态）：
  - **空闲/睡眠**（`idle`/`sleeping` 等非任务、非一次性态）→ 通过新 IPC `play-health-reminder`
    让宠物播放该提醒的身体动画（覆盖层，复刻 `playReaction`）。
  - **任务占用**（priority ≥ working，或任意 oneshot 态）→ **不播身体动画**，仅显示文字气泡；
    同时把该提醒标记为「待补播身体动画」。
- 当显示状态由忙转为空闲、且该提醒气泡仍打开时，**补播一次**身体动画，然后清除待补播标记。
- 额外安全网：即使身体动画在播，若任务突然到来，`renderer.js` 既有「状态变化取消反应」机制
  会让位给任务态——但因为我们只在空闲触发，正常情况下不会发生。

### 5.3 触发闸门（是否「提醒」本身）

到点时，先过静态闸门 `gate.js`：

- `respectDnd && ctx.doNotDisturb` → **本次不提醒**（不弹气泡、不播动画）。
- `quietHours.enabled && 当前在静默窗口内` → **本次不提醒**。
- 否则 → 弹气泡（§5.1）+ 视身体忙闲决定身体动画（§5.2）。

> 注意：忙/闲**不**作为「是否提醒」的闸门——忙碌时仍会弹文字气泡（堆在任务下方），
> 只是不播身体动画。这正是用户确认的语义。

## 6. 模块清单与接入点

### 6.1 新增文件（fork 自有，几乎不与上游冲突）

| 文件 | 职责 |
| --- | --- |
| `src/health-reminder/reminder-model.js` | 纯逻辑：normalize/validate 单条提醒与整体配置 |
| `src/health-reminder/scheduler.js` | 纯逻辑：给定 now 与提醒，算下次触发时间（interval/daily/weekday） |
| `src/health-reminder/quiet-hours.js` | 纯逻辑：判断 now 是否在静默窗口（含跨午夜） |
| `src/health-reminder/gate.js` | 纯逻辑：身体动画可否播放 + 触发闸门（DND/静默） |
| `src/health-reminder-settings.js` | prefs 读写、masked/默认值、与 settings-actions 对接 |
| `src/health-reminder-main.js` | 主进程生命周期：tick、到点判定、气泡与动画编排、IPC |
| `src/health-reminder-bubble.js` | 独立常驻气泡窗口管理（创建/定位/堆叠/销毁） |
| `src/preload-health-bubble.js` | 气泡窗口 preload（暴露 confirm/snooze IPC） |
| `src/health-bubble-renderer.js` | 气泡窗口渲染逻辑（文字、知道了、稍后） |
| `pwa/health-bubble.html` | 气泡窗口 HTML |
| `src/settings-tab-health-reminder.js` | 「健康提醒」设置 Tab UI |
| `themes/clawd/assets/clawd-health-*.svg` | clawd 健康动画素材（5 个，见动画规范） |

### 6.2 现有文件接入点（小而集中，逐个加测试）

| 文件 | 改动（仅接入点） |
| --- | --- |
| `src/prefs.js` | 新增 `healthReminder` schema 与默认值（参照 `feishuApproval` L294）；在主题覆盖 map 允许键中加入 `healthReminders`（参照 L819/L849 `reactions`），新增 `normalizeHealthReminderOverridesMap` |
| `src/settings-actions.js` | 新增 `healthReminder.*` 命令：`addReminder/updateReminder/removeReminder/reorderReminders/setEnabled/setQuietHours/setRespectDnd/setAutoCollapse/testReminder` |
| `src/main.js` | 初始化 `health-reminder-main` 运行时；注册 IPC；在已计算的显示状态处提供给运行时（小块） |
| `src/settings-renderer.js` | `SIDEBAR_TABS` 在 `mobile` 与 `about` 之间插入 `{ id:"healthReminder", icon:"\u{1F9CB}", labelKey:"sidebarHealthReminder", available:true }`；并 `init` 新 Tab |
| `src/settings-i18n.js` | 新增 `sidebarHealthReminder` 及 Tab 文案（en/zh/zh-TW/ko/ja 五语） |
| `src/settings-animation-overrides-main.js` | 新增 `buildHealthReminderCards()`（读 `activeTheme.healthReminders`，`slotType:"healthReminder"`、`sectionId:"health"`、`id:health:${key}`、`bindingLabel:healthReminders.${key}`）；`pushSection(sections,"health",null,cards)` |
| `src/settings-tab-anim-overrides.js` | `getAnimOverrideSectionTitle("health")` 与触发标签（drink/stretch/...）；其余复用既有 reaction 卡片渲染（slotType 分支） |
| `src/settings-anim-overrides-merge.js` / 覆盖应用 | 主题覆盖应用纳入 `healthReminders`（复刻 `reactions` 路径），使替换素材生效 |
| `src/renderer.js` | 新增 `playHealthReminderAnimation(svg, duration)`（复刻 `playReaction`）+ `onPlayHealthReminder` IPC 监听 |
| `themes/*/theme.json` | 新增 `healthReminders` 块（clawd 全套；cloudling/calico 回退到现有素材） |

### 6.3 第一版应避免

- 改名/迁移现有气泡、反应、状态机文件。
- 重排 `main.js` 大段生命周期。
- 改 agent hook、审批、远程 SSH 等无关模块。
- 把健康提醒逻辑塞进 `permission.js` 的气泡流程（应作为独立窗口）。
- 让健康提醒复用 `notification` 气泡的 prefs 字段或生命周期。

## 7. 默认随包提醒（主开关默认 off）

| label | type | 触发 | days | animationKey | message |
| --- | --- | --- | --- | --- | --- |
| 喝水 | interval | 每 45 分钟 | 工作日 | drink | 该喝水啦 💧 起来接杯水吧 |
| 久坐起身 | interval | 每 60 分钟 | 每天 | stretch | 久坐啦，起来活动两分钟 🧍 |
| 护眼远眺 | interval | 每 30 分钟 | 工作日 | eyerest | 看屏久了，远眺 20 秒 👀 |
| 午饭时间 | daily | 12:00 | 周一–周五 | eat | 中午啦，去吃饭 🍱 |
| 下班提醒 | daily | 18:30 | 周一–周五 | offwork | 到点下班，今天辛苦啦 👋 |

## 8. 设置 UI

### 8.1 「健康提醒」Tab（新）

- 顶部：主开关「启用健康提醒」+ 说明。
- 全局：尊重勿扰（DND）开关；静默时段（开关 + 起止时间）；无操作自动收起（分钟，0=不收起）。
- 提醒列表：每条显示 label、时间摘要（「每 45 分钟·工作日」/「每天 12:00·周一–周五」）、
  所用动画、启用开关、编辑/删除。
- 新增/编辑表单：label、message、调度（interval/daily 切换 + 间隔/时刻 + 星期多选）、
  animationKey 下拉（来自当前主题 healthReminders + "none"）、snoozeMinutes、「测试一次」。
- 「测试一次」：立即触发该提醒一次（走完整闸门与编排），便于预览。

### 8.2 「动画/音效替换」新增「健康提醒动画」分区

- 与 idle/work/interrupts/sleep/**reactions**/mini 并列，新增 **health** 分区。
- 每个健康动画一张卡片，支持像反应动画那样：预览、替换 SVG、改时长/过渡、重置。
- 完全复用既有卡片渲染与 `setAnimationOverride` 命令，仅扩展 slotType 与分区标题/标签。

## 9. 测试策略

必须新增单测（Node `node --test`）：

- `test/health-reminder-model.test.js`：normalize/validate（缺字段、非法时间、默认值、id 生成）。
- `test/health-reminder-scheduler.test.js`：interval 对齐、daily 多时刻、weekday 过滤、
  跨午夜、夏令时/月末边界、上次触发后下次时间。
- `test/health-reminder-quiet-hours.test.js`：普通窗口、跨午夜窗口、边界相等。
- `test/health-reminder-gate.test.js`：DND/静默跳过；身体动画忙/闲判定。
- `test/health-reminder-settings.test.js`：prefs normalize、默认 off、迁移。
- `test/health-reminder-main.test.js`（fake 渲染/气泡）：到点→弹气泡；忙→只弹气泡不播身体动画；
  忙转闲→补播一次；confirm/snooze 结算；DND/静默不弹；与 permission 气泡相互独立。
- 扩展 `test/prefs.test.js`：`healthReminder` schema + `healthReminders` 覆盖 map。
- 扩展 `test/settings-actions.test.js`：`healthReminder.*` 命令。
- 扩展 `test/settings-renderer-browser-env.test.js`：侧栏出现「健康提醒」Tab；CRUD 流程。
- 扩展动画替换主进程测试：health 分区与卡片生成、替换生效。

回归保护（默认关闭即零影响）：

- `healthReminder.enabled=false` 时：不建定时器、不创建气泡窗口、无 IPC 副作用。
- 现有 permission/notification/update 气泡、反应动画、状态机、审批测试全部不回归。

手动 QA（Windows 本机）：

1. 启用一条 interval 提醒（间隔设 1 分钟）→ 空闲时：身体动画 + 文字气泡。
2. 触发一个真实任务（让宠物进入 working）→ 到点：仅文字气泡堆在任务气泡下方，身体不打断。
3. 任务结束回到空闲、气泡仍在 → 身体动画补播一次。
4. 「稍后再提醒」→ 约 10 分钟后再次提醒；「知道了」→ 气泡消失，不影响任务气泡。
5. 开 DND / 进入静默时段 → 到点不提醒。
6. 在「动画/音效替换」替换 drink 动画 → 提醒时使用新素材。
7. 关闭主开关 → 无任何提醒、无残留窗口。

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 独立气泡窗口与现有气泡定位/层级打架 | 视觉错位/遮挡 | 复用现有相对宠物几何，仅加垂直偏移；健康气泡不抢焦点；多显示器用相同 workArea 逻辑 |
| 身体动画与任务态竞争 | 打断任务动画 | 只在空闲触发；忙→闲补播；保留「状态变化取消反应」安全网 |
| 定时器在休眠/系统时钟跳变后漂移 | 提醒不准/重复 | scheduler 基于绝对 wall-clock 计算下次时间，tick 用对齐而非累加；唤醒后重算 |
| 默认开启影响上游用户 | 行为回归 | 主开关默认 off；未启用零开销；逐位回归测试 |
| 上游更新导致冲突 | fork 合并成本 | 新增文件为主；接入点小而集中且有测试；维护合并清单 |
| 气泡堆积打扰 | 体验差 | 常驻但可设自动收起；可视上限 + 排队；v2 加「全部知道了」 |
| 三主题动画不全 | 表现不一致 | v1 cloudling/calico 回退到现有素材，可正常提醒；v2 补齐 |

## 11. 非目标（v1）

- 不做 cloudling/calico 专属健康动画（仅回退；v2 做）。
- 不做提醒统计/打卡/连续天数。
- 不做基于鼠标活跃度/前台应用的自适应调度。
- 不做移动端健康提醒（仅桌面宠物）。
- 不做云同步、不做跨设备。
- 不改变 DND、headless、审批、agent hook 的任何语义。

## 12. 验收标准

功能验收：

- 「健康提醒」Tab 出现在「移动端」与「关于」之间，可增删改提醒、设静默时段。
- 主开关 off 时无任何提醒与窗口；on 后按配置触发。
- 空闲时：身体动画 + 文字气泡；任务时：仅文字气泡堆在任务气泡下方，任务不被打断；
  忙转闲：身体动画补播一次。
- 「知道了」「稍后再提醒（默认 10 分钟可改）」按预期工作，且不影响任务气泡。
- DND/静默时段内不提醒。
- 「动画/音效替换」出现「健康提醒动画」分区，可像反应动画一样替换/重置素材并生效。

工程验收：

- `npm test` 通过；新增测试覆盖 model/scheduler/quiet-hours/gate/settings/main 及接入点。
- `healthReminder.enabled=false` 时现有测试全部不回归。
- 现有文件改动可清晰解释为接入点改动，无顺手重构。
- 文档更新：setup guide / known limitations（如需）+ release note 标注新功能与 v1 动画范围。

## 13. 需你确认后才进入实现

关键决策已在 [README](README.md) 记录并确认。实现前请最终确认：

- 默认随包提醒清单（§7）是否合适。
- 侧边栏图标（暂定 🧋；可改）。
- 是否在本仓库直接实现，还是先建独立分支（建议独立 feature 分支，便于回滚与合并）。
