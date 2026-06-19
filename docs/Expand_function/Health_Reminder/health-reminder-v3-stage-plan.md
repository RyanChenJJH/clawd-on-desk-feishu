# 健康提醒 v3 任务计划（分阶段 · TDD）

> 状态：**待评审**（未动工）。配套方案：[health-reminder-v3-development-plan.md](health-reminder-v3-development-plan.md)。
> 日期：2026-06-17
> 原则：每阶段**先写测试再实现**；每阶段结束跑全量健康用例保持绿；阶段间可独立提交。

---

## 阶段 V3-P1：纯布局引擎（地基）

**目标**：从根上解决「夹回工作区 + 上推 + 两模式 + 避让宠物」。

- [ ] 新建 `src/health-reminder/bubble-layout.js`，实现 `computeHealthStackLayout(...)`（见方案 §3.1）。
- [ ] 新建 `test/health-reminder-bubble-layout.test.js`：
  - corner：基线锚右下角内缩 margin；新卡在下、旧卡上推。
  - followPet：右/左/上/下候选择位；整组不与 `petHitRect` 相交。
  - 四角 + 四边：整组始终夹在 workArea 内。
  - 超高：整组高度 > 可用高度时仅保留最新 `maxVisible` 条，返回 `hiddenIds`。

**涉及文件**：`src/health-reminder/bubble-layout.js`、`test/health-reminder-bubble-layout.test.js`
**验收**：布局单测全绿；穷举边界无溢出、无遮挡。

---

## 阶段 V3-P2：气泡控制器接入布局引擎

**目标**：控制器用布局引擎统一复位，堆叠顺序反转为「上推」。

- [ ] 改 `src/health-reminder-bubble.js`：移除 `layout()` 的裸坐标累加，改为收集各窗口高度→调 `computeHealthStackLayout`→`setBounds`/`hide`。
- [ ] 注入 `getMode()`/`getWorkArea()`/`getPetHitRect()`/`getMaxVisible()`。
- [ ] 顺序反转：最新卡置基线、旧卡上移。
- [ ] 改 `test/health-reminder-bubble.test.js`：模式切换、顺序、复位、隐藏最旧。
- [ ] main.js 接线：`getWorkArea` 复用 `getNearestWorkArea(petCenter)`、`getPetHitRect` 复用 `getHitRectScreen(petBounds)`；并把健康复位挂到宠物移动信号（与任务气泡同源），不止 2s 轮询。

**涉及文件**：`src/health-reminder-bubble.js`、`src/main.js`、`test/health-reminder-bubble.test.js`
**验收**：贴边/多卡片下不溢出；拖动宠物时健康卡跟随不滞后。

---

## 阶段 V3-P3：两种显示模式（配置 + 设置 UI）

**目标**：`followPet`（默认）/`corner` 全局可选。

- [ ] `src/health-reminder/reminder-model.js`：`normalizeConfig` 加 `displayMode`（默认 `followPet`）、`cornerAnchor`（默认 `bottomRight`）。
- [ ] 改 `test/health-reminder-model.test.js` / `health-reminder-prefs.test.js`：默认值、归一化、向后兼容。
- [ ] `src/settings-tab-health-reminder.js`：新增「显示模式」选择器；`src/settings-i18n.js` 加多语言键。
- [ ] 改 `test/health-reminder-settings.test.js` / `health-reminder-tab.test.js`。
- [ ] main.js 的 `getMode()` 读 `healthReminder.displayMode`；切换即时复位。

**涉及文件**：`reminder-model.js`、`settings-tab-health-reminder.js`、`settings-i18n.js`、对应测试
**验收**：设置切换两模式即时生效并各自不溢出。

---

## 阶段 V3-P4：任务优先（让位 / 补显示）

**目标**：任务卡片优先，被让位的健康提醒不丢失。

- [ ] `src/health-reminder-main.js`：注入 `hasActiveTaskBubble()`；新增 `deferredQueue` 与 `onTaskActive()/onTaskCleared()`；fire 时若任务在场则入队不显示。
- [ ] 新增 `test/health-reminder-task-priority.test.js`：defer / 立即收起转 defer / 任务清空 flush / 不误计 confirmed·snoozed。
- [ ] main.js：在 `onPermissionsChanged` 比较任务气泡数 0↔>0 跃迁，桥接到 `onTaskActive/onTaskCleared`；加短去抖（防抖动，见方案 R2）。
- [ ] main.js 暴露「任务气泡是否在场」查询（基于 permission 模块 pending 计数）。

**涉及文件**：`src/health-reminder-main.js`、`src/main.js`、`test/health-reminder-task-priority.test.js`
**验收**：方案 §8 第 4 条全部满足。

---

## 阶段 V3-P5：3D 半透明卡片视觉

**目标**：半透明 + 渐变 + 立体科技感，明暗自适应。

- [ ] 改 `pwa/health-bubble.html` 样式（不动 IPC / `reportHeight` / 窗口属性）。
- [ ] 明暗两套；按钮可点、对比度可读。
- [ ] 文档注明透明窗口 `backdrop-filter` 局限（见方案 §3.4）。
- [ ] 人工校验（截图）：四角、明暗、单/多卡。

**涉及文件**：`pwa/health-bubble.html`
**验收**：观感达标；不破坏点击与高度自适应。

---

## 阶段 V3-P6：全局开关显眼化（G6）

**目标**：主开关置顶、一键启停。

- [ ] `settings-tab-health-reminder.js`：主开关移至 Tab 顶部、视觉突出（沿用现有 `enabled`，不新建机制）。
- [ ] （可选）托盘/菜单加「健康提醒」快捷开关项，复用同一 setting。
- [ ] 回归：启停即时 start/stop + `dismissAll`（[main.js:1463](../../../src/main.js#L1463) 链路）。

**涉及文件**：`settings-tab-health-reminder.js`、（可选）`menu.js`
**验收**：一键启停即时生效；关闭后无残留健康气泡。

---

## 阶段 V3-P7：回归、文档、上游清单

- [ ] 跑全量健康用例（v1+v2+v3）保持绿。
- [ ] 更新 [README.md](README.md) 文档导航表，加入 v3 两份文档与「v3 推翻 v1 决策 #1」说明。
- [ ] 更新 [upstream-merge-checklist.md](upstream-merge-checklist.md)：新增几何/任务优先回归用例与合并注意点。
- [ ] 写 v3 实施日志 `health-reminder-v3-log.md`（决策、取舍、延后项）。

**验收**：文档可回溯；清单含 v3 回归项。

---

## 阶段 V3.1：补完遗漏（**必做，禁止当"纯展示层"推迟**）

> 背景：V3-P1～P7 把引擎/逻辑做了，但**设置页 UI 与科技卡片被错误推迟**，导致用户切不到模式、看不到全局开关、卡片不是科技感。
> 本阶段把这些缺口作为**硬需求**补齐；用户要求**全部补齐后再统一验收**。

### V3.1-A：显示模式选择器（需求 1.1B，必做）
- [ ] `health-reminder-settings.js` + `settings-actions.js`：新增 `healthReminder.setDisplayMode` 命令（值 `followPet`/`corner`），TDD（settings 命令测试）。
- [ ] `settings-tab-health-reminder.js`：新增「显示模式」选择器（跟随宠物 / 屏幕右下角），绑定该命令；改 `test/health-reminder-tab.test.js`。
- [ ] `settings-i18n.js`：5 语文案键。
- **验收**：运行 app，设置页可见模式选择器，切 corner/followPet 立即生效、各自不溢出。

### V3.1-B：主开关置顶醒目（需求 1.3，必做）
- [ ] `settings-tab-health-reminder.js`：把 `enabled` 主开关移到 Tab **最顶部**并视觉突出（标题/大开关）。
- **验收**：运行 app，进入健康 Tab 第一眼即见总开关；一键启停即时生效、关停清空气泡。

### V3.1-C：科技感卡片重做（需求 1.1A「科技感/3D」，必做）
- [ ] 重做 `pwa/health-bubble.html`：**暗色玻璃底 + Clawd 品牌橙霓虹发光描边/标题/状态点 + 多层 3D 阴影/高光**（方向已确认），替换现暖色版；明暗两套；按钮可点、高度自适应不变。
- **验收**：运行 app，四角/明暗/单多卡下观感确为"科技感"（暗色+橙霓虹），非暖色温馨风。

### V3.1-D：端到端运行验证（必做，不可跳过）
- [ ] 实际 `npm start` 启动 app，逐条走查方案 §8 第 1–7 条（贴边不溢出、上推、不遮挡宠物、任务优先、总开关、模式切换、科技卡片）。
- [ ] 在 `health-reminder-v3-log.md` 追加「V3.1 运行验证」节，附逐条结论/截图。
- **验收**：§8 全部 9 条达成并留痕。

### V3.1 涉及文件
`src/health-reminder-settings.js`、`src/settings-actions.js`、`src/settings-tab-health-reminder.js`、`src/settings-i18n.js`、`pwa/health-bubble.html`、`test/health-reminder-settings.test.js`、`test/health-reminder-tab.test.js`

---

## 阶段 V3.2：修复 followPet 永远右下角（**真 BUG，命中矩形结构不匹配**）

> 用户反馈：设置「跟随宠物」后点测试，卡片依旧在右下角。
> 根因（已坐实）：命中矩形 `getHitRectScreen()` 返回 `{left,top,right,bottom}`（[pet-geometry-main.js:30](../../../src/pet-geometry-main.js#L30)，任务气泡 [permission.js:301](../../../src/permission.js#L301) 同此约定），
> 但 v3 新写的 [bubble-layout.js:82](../../../src/health-reminder/bubble-layout.js#L82) 读 `petHitRect.width/.x/.height` → `Number.isFinite(petHitRect.width)` 恒 false → **followPet 整段被跳过 → 每次落到右下角兜底**。
> 单测当初喂了臆想的 `{x,y,width,height}`，所以没抓到——测了臆想接口而非真实集成。

### V3.2-A：布局引擎改用统一命中矩形契约（必做）
- [ ] **RED**：改 `test/health-reminder-bubble-layout.test.js`——followPet 用例改用**真实结构 `{left,top,right,bottom}`**；现实现会失败（仍走右下角兜底）。
- [ ] **GREEN**：`computeHealthStackLayout` 改读 `{left,top,right,bottom}`；右/左/上/下候选位按 left/right/top/bottom 重算；保持"整组在工作区内 + 不与宠物相交 + 向上生长"。
- [ ] **followPet 兜底改进**：候选都放不下时，回退到**贴宠物的最优一侧（剩余空间最大者）并夹回屏内**，**不再跳到屏幕右下角**（屏幕角仅 `corner` 模式用）。
- **验收**：单测全绿（真实结构）；mid-screen / 四角 / 贴边宠物下，followPet 卡片都贴着宠物、不溢出、不遮挡。

### V3.2-B：防回归集成测试（必做）
- [ ] 新增一条测试：直接喂 `getHitRectScreen` 的**真实输出形状**（`{left,top,right,bottom}`，可用 `getFullHitRect`/固定样例）给 `computeHealthStackLayout`，断言 followPet 真生效（卡片落在宠物侧，而非右下角）。锁死"layout 与命中矩形契约一致"。
- **验收**：该测试在修复前红、修复后绿；契约漂移会立刻失败。

### V3.2-C：运行验证（必做）
- [ ] `npm start`，设置 followPet → 点测试 → 卡片出现在宠物周围；移动宠物到四角再测，均贴宠物不溢出。结论写入 `health-reminder-v3-log.md`。

### V3.2 涉及文件
`src/health-reminder/bubble-layout.js`、`test/health-reminder-bubble-layout.test.js`（`src/main.js` 的 `getPetHitRect` 已直传 `getHitRectScreen`，无需改）

---

## 涉及文件总览

| 类别 | 文件 |
| --- | --- |
| 新增 | `src/health-reminder/bubble-layout.js`、`test/health-reminder-bubble-layout.test.js`、`test/health-reminder-task-priority.test.js`、`docs/.../health-reminder-v3-log.md` |
| 改动 | `src/health-reminder-bubble.js`、`src/health-reminder-main.js`、`src/main.js`、`src/health-reminder/reminder-model.js`、`src/settings-tab-health-reminder.js`、`src/settings-i18n.js`、`pwa/health-bubble.html`、（可选）`src/menu.js`、对应测试、`README.md`、`upstream-merge-checklist.md` |

> 建议提交顺序：P1→P2→P3→P4→P5→P6→P7，每阶段独立可评审、可回滚。
