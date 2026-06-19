# 健康提醒 v3 开发方案：屏幕内定位 + 上推堆叠 + 任务优先 + 3D 卡片

> 状态：**方案待评审**（未动工）。
> 日期：2026-06-17
> 关联问题：用户反馈「健康卡片在屏幕边缘溢出/点不到」「多卡片底部溢出」「与任务卡片重叠」。
> 前置：本方案基于 v1+v2 已实施代码（见 [README](README.md)）。本版**有意推翻 v1 决策 #1 的部分内容**（见下「设计反转」）。

---

## 0. 需求澄清结论（已与用户确认）

| 项 | 结论 |
| --- | --- |
| 默认显示模式 | **模式2 跟随宠物**（贴边夹回、不遮挡宠物）。两种模式都做，可在设置切换。 |
| 多卡片处理 | **不合并**。仍是独立卡片；但**堆叠方向改为向上生长**：最新一条在锚点（最靠近基线）显示，先出现的依次**自动上移**腾位。 |
| 卡片视觉 | **略微透明 + 渐变 + 科技感 + 立体感（3D）**。 |
| 任务优先 | 有任务卡片时健康**延迟**；健康显示中来任务则健康**立即退场**（不论是否点击），任务结束后再补显示。 |
| 全局开关 | 已存在 `healthReminder.enabled`，要求使其**显眼、可一键启停**。 |

---

## 1. 目标

1. **G1 不溢出**：任意屏幕位置（含四角、贴边）下，健康卡片**永远完整落在工作区内**、可点击；两种模式皆然。
2. **G2 上推堆叠**：多条提醒并存时，独立卡片**新在下、旧上推**，整组夹在工作区内，超过 `maxVisibleBubbles` 时只隐藏最旧的，不溢出。
3. **G3 两种定位模式**：`followPet`（默认）/`corner`（统一右下角），全局设置项。
4. **G4 任务优先**：与任务气泡互斥——任务在场时健康让位；健康让位的提醒**不丢失**，任务结束补显示。
5. **G5 3D 卡片**：半透明/渐变/层次阴影的科技感卡片，明暗主题自适应。
6. **G6 全局开关**：主开关一键启停，置于「健康提醒」Tab 顶部，启停即时生效（沿用现有 `enabled` 链路）。

---

## 2. 根因分析（从源头，非打补丁）

### 2.1 溢出 / 点不到（G1、G2）
- **源头在 [`src/health-reminder-bubble.js`](../../../src/health-reminder-bubble.js) 的 `layout()`**：
  - 锚点取宠物窗口下方（[`main.js:1401-1409`](../../../src/main.js#L1401)：`y = bounds.y + height*0.62`，x 居中对齐宠物），然后**只向下堆叠**（`y += height + STACK_GAP`）。
  - **完全没有工作区（work area）边界裁剪**：没有任何 `clamp` 把 x/y/底边夹回屏幕。宠物贴下边/右边/左边时整组溢出；多卡片向下堆时底部溢出 → 看不见、点不到。
  - 每条提醒各开一个独立 `BrowserWindow`，纯按 `order` 数组从上往下排。
- **对照已有成熟实现**：任务/权限气泡走 [`permission.js:565 repositionBubbles()`](../../../src/permission.js#L565) → `computeBubbleStackLayout({ workArea, followPet, hitRect, margin, gap, ... })`，**本身就含工作区裁剪 + 跟随宠物 + 避让命中区**。健康气泡当年另起炉灶、未复用这套几何逻辑，是根因。
- **结论**：不是给 `layout()` 补几个 `Math.min`，而是**新建一个与 `computeBubbleStackLayout` 同级、纯函数、可单测的健康专用布局引擎**，从根上具备「夹回工作区 + 两模式 + 上推 + 避让宠物」。

### 2.2 与任务卡片重叠（G4）——这是一次「设计反转」
- v1 既定决策 #1（[README](README.md)）是「**共存、互不打断**，健康气泡永远堆在任务气泡下方」。当时 `health-reminder-main.js` **完全不感知任务气泡是否存在**（无任何任务状态输入）。
- 用户新需求是「**任务优先**」，与原决策相反。这不是 bug 而是**需求演进**，需在实现中明确推翻原基线，并**新增任务在场的感知**。
- **可用的源头集成点**：[`main.js:1180 onPermissionsChanged`](../../../src/main.js#L1180) 在任务/权限气泡增删/解决时都会触发；`repositionBubbles()` 是复位入口。可据此事件驱动健康的「让位/补显示」，无需轮询、无需改任务气泡内部逻辑。

### 2.3 全局开关（G6）
- 主开关 `healthReminder.enabled` 已存在（[`health-reminder-main.js:53 isMasterEnabled()`](../../../src/health-reminder-main.js#L53)；[`main.js:1463`](../../../src/main.js#L1463) 据此 `start/stop + dismissAll`）。属「使其更显眼」，非新建机制。

---

## 3. 架构设计

### 3.1 新增纯布局引擎（核心）
新建 `src/health-reminder/bubble-layout.js`，导出纯函数：

```
computeHealthStackLayout({
  mode,            // "followPet" | "corner"
  workArea,        // { x, y, width, height } 目标显示器工作区
  petHitRect,      // 宠物命中矩形（屏幕坐标），followPet 用于避让
  bubbleWidth,     // 统一卡宽
  bubbleHeights,   // 按"显示顺序：新→旧"或"旧→新"约定的高度数组
  gap, margin,     // 卡间距、与屏幕边缘留白
  maxVisible,      // 可见上限（maxVisibleBubbles）
}) -> { bounds: [{x,y,width,height}|null...], hiddenIds:[...] }
```

规则：
- **上推生长**：最新卡的**底边**锚在基线（baseline），其余旧卡依次叠在其上方，整组高度 = Σ高度 + (n-1)*gap。
- **基线定义**：
  - `corner`：基线 = 工作区右下角内缩 `margin`（底边 = `workArea.y + workArea.height - margin`，右边 = `workArea.x + workArea.width - margin - bubbleWidth`）。
  - `followPet`：基线取宠物附近，但**整组不得与 `petHitRect` 相交**、不得超出工作区；按「右侧→左侧→上方→下方」候选顺序择第一个可容纳的位置。
- **四边夹回**：整组的 top/bottom/left/right 全部 `clamp` 进 `workArea`；若整组高度 > 可用高度，则**只保留最新的 `maxVisible` 条**（隐藏最旧），仍不溢出。
- 纯函数、不依赖 Electron，便于穷举单测（四角、超高、两模式、避让）。

### 3.2 重写气泡控制器
改造 [`src/health-reminder-bubble.js`](../../../src/health-reminder-bubble.js)：
- **保留**「每条一个窗口」（不合并），但**所有定位统一走 `computeHealthStackLayout`**，在 show/dismiss/高度变化/宠物移动/模式切换时整体复位。
- **顺序语义反转**：新卡入栈后置于基线（底），旧卡上移（当前实现是「先来的在顶、向下堆」，需反转为「后来的在底、向上堆」）。
- 新增注入：`getMode()`、`getWorkArea()`、`getPetHitRect()`（由 main.js 复用 `ctx.getNearestWorkArea` / `getHitRectScreen` 提供）。
- 复位时机：除现有 2s 轮询外，**接入宠物移动的复位信号**（与任务气泡同源），避免拖动宠物时健康卡滞后。

### 3.3 任务优先：让位 / 补显示
在 [`src/health-reminder-main.js`](../../../src/health-reminder-main.js) 运行时新增：
- 注入 `hasActiveTaskBubble()`（main.js 据 permission 模块的 pending 任务气泡数判断）。
- 状态机：
  - **fire 时**：若 `hasActiveTaskBubble()` 为真 → **不显示**，记入 `deferredQueue`，待任务清空再 present。
  - **健康开着、任务来了**（由 `onPermissionsChanged` 触发的 `onTaskActive()`）→ **立即收起所有健康气泡**，但**不计为已确认/已贪睡**，原样转入 `deferredQueue`。
  - **任务清空**（`onTaskCleared()`）→ flush `deferredQueue`，重新 present（去重、尊重静默/DND 门控）。
- **不丢失语义**：被让位/延迟的提醒既不算 confirmed 也不算 snoozed，其调度计时器不受影响（已 fire 的照常按节奏重排）。
- main.js 侧桥接：在 `onPermissionsChanged` 里比较「任务气泡数」0↔>0 跃迁，调用 `runtime.onTaskActive()/onTaskCleared()`。

### 3.4 科技感 3D 卡片（暗色 + 品牌橙霓虹 · 用户已选方向）

> ⚠️ **修正（v3.1）**：首版做成了暖色奶油橙的"温馨风"，**不是科技感**，不达标，需**重做**。
> 方向已与用户确认：**暗色玻璃 + Clawd 品牌橙作为霓虹发光强调色**。

改造 [`pwa/health-bubble.html`](../../../pwa/health-bubble.html) 样式（不动窗口属性/IPC/`reportHeight` 机制）：
- **暗色半透明玻璃底**：深色 rgba 渐变面板（非奶油暖色），明/暗主题各一套但整体走"暗玻璃"基调。
- **品牌橙霓虹**：边框/分隔线/标题/状态点用 Clawd 橙（#d97757 系）做**发光描边 + 外辉光（glow）**，营造"通电/未来"感；可加细等宽数字或细网格/扫描线点缀。
- **立体 3D**：多层投影（悬浮）+ `inset` 顶部高光（凸起）+ 轻微入场缩放，层次分明。
- **按钮**：主按钮品牌橙渐变 + 橙色辉光；次按钮暗色半透明。
- **平台约束（如实记录）**：Electron 透明窗口的 `backdrop-filter` 只能模糊「页面内自身内容」，**无法模糊桌面背景**——玻璃感靠 rgba 渐变 + 阴影/高光/辉光实现，不依赖真实桌面毛玻璃。
- 保持按钮可点（窗口 `focusable:false` + `showInactive` 不变）、保留高度自适应上报。
- **验收必须在运行 app 中肉眼确认达到「科技感」**，不得以"本环境无显示"为由跳过（见 §8）。

### 3.5 配置与设置 UI（**硬需求，禁止当"纯展示层"推迟**）

> ⚠️ **修正（v3.1）**：首版把「模式选择器」「主开关置顶」推迟成了"续做/纯展示层"，导致用户**切不到 corner 模式、看不到全局开关**——等于需求 1.1B/1.3 未达成。本节为**必做交付项**。

- `src/health-reminder/reminder-model.js` 的 `normalizeConfig` 新增：
  - `displayMode: "followPet" | "corner"`（默认 `"followPet"`，非法值回退 followPet）。✅ 配置已加
  - `cornerAnchor`（默认 `"bottomRight"`，本期只实现右下角，预留枚举）。
- 新增 `healthReminder.setDisplayMode` 命令（`settings-actions.js` + `health-reminder-settings.js`），写入沿用 `prefs.js → settings-controller → settings-store`。
- [`src/settings-tab-health-reminder.js`](../../../src/settings-tab-health-reminder.js)（**必做**）：
  - **主开关置顶醒目**（G6）：Tab 第一项就是「健康提醒 总开关」，一眼可见、一键启停。
  - **「显示模式」选择器**（G3/需求 1.1B）：单选/下拉「跟随宠物 / 屏幕右下角」，改动即时落库并复位。
- `src/settings-i18n.js`：新增 zh / zh-TW / en / ja / ko 文案键（侧栏/标签 parity）。
- **验收必须在运行 app 中确认**：设置页能看到总开关 + 模式选择器，切换 corner/followPet 立即生效（见 §8）。

---

## 4. 数据模型变更

`healthReminder`（顶层，[reminder-model.js normalizeConfig](../../../src/health-reminder/reminder-model.js#L111)）新增：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `displayMode` | `"followPet"\|"corner"` | `"followPet"` | 全局显示模式 |
| `cornerAnchor` | enum | `"bottomRight"` | 预留；本期只实现右下角 |

- 既有 `maxVisibleBubbles`（[1,5]，默认 3）继续作为上推堆叠的可见上限。
- 向后兼容：旧配置无新字段时取默认；归一化保证健壮。

---

## 5. 模块边界与上游合并友好

- 新增/改动集中在 `src/health-reminder*`、`src/health-reminder/`、`pwa/health-bubble.html`、`settings-tab-health-reminder.js`、`settings-i18n.js`。
- **不改任务/权限气泡内部代码**：仅**读取**任务气泡是否在场、**复用** `getNearestWorkArea`/`getHitRectScreen`/`onPermissionsChanged`/`repositionBubbles`，通过 main.js 注入。
- 行为变更（G1 夹回、G4 任务优先、默认 followPet）是用户明确要求，属**有意推翻 v1 决策 #1**；在 [README](README.md) 与 [upstream-merge-checklist](upstream-merge-checklist.md) 标注，便于回溯与合并取舍。

---

## 6. 测试策略（TDD）

| 测试文件 | 覆盖 |
| --- | --- |
| 新增 `test/health-reminder-bubble-layout.test.js` | `computeHealthStackLayout`：四角/贴边夹回、上推顺序、超高时仅保留最新 N 条、followPet 不与 petHitRect 相交、corner 锚右下角 |
| 改 `test/health-reminder-bubble.test.js` | 控制器经布局引擎复位、模式切换、顺序反转、宠物移动复位 |
| 新增 `test/health-reminder-task-priority.test.js` | fire 时任务在场→defer；健康开着任务来→立即收起且转 defer；任务清空→flush 补显示；不误计 confirmed/snoozed |
| 改 `test/health-reminder-model.test.js` / `health-reminder-prefs.test.js` | `displayMode`/`cornerAnchor` 归一化与默认 |
| 改 `test/health-reminder-settings.test.js` / `health-reminder-tab.test.js` | 设置项与 UI 选择器 |

并保证 v1+v2 现有健康用例（README 记 315/315）全绿。

---

## 7. 风险与权衡

- **R1 followPet 在小屏/宠物贴角**：候选位都放不下时，回退到 corner 行为（保证不溢出优先于"跟随"）。
- **R2 任务优先的抖动**：任务气泡频繁增删可能导致健康反复收起/补显示；用「短去抖 + 仅在 0↔>0 跃迁时动作」抑制。
- **R3 透明窗口视觉**：3D 效果在不同 OS/缩放下表现差异；以 rgba+阴影+渐变为主，避免依赖不可用的桌面毛玻璃。
- **R4 上游合并**：本版推翻共存基线，合并上游时若上游改了气泡几何，需重测 R1/R4 场景。

---

## 8. 验收标准

> **所有视觉/UI 项必须在运行的 app 中肉眼验证**（不得以"本环境无显示"为由跳过）。
> 单测绿是必要条件、不是充分条件。

1. 宠物置于屏幕**任意边缘/四角**：两种模式下健康卡**均完整可见、可点击**，无裁剪。
2. 连续触发多条提醒：独立卡片、**新在下旧上推**，整组不溢出；超过上限只隐藏最旧。
3. `followPet` 下健康卡**绝不遮挡宠物**。
4. 有任务气泡时健康**延迟**；健康开着任务到来→健康**立即退场**、任务显示；任务结束→被让位的健康**补显示**且未丢失。
5. **设置页可见性（必验）**：健康提醒 Tab **顶部就有醒目总开关**，一键启停即时生效（关停清空所有健康气泡）。
6. **设置页模式切换（必验）**：健康提醒 Tab 有「显示模式」选择器，切换「跟随宠物 / 右下角」**立即生效**且各自不溢出。
7. **科技感卡片（必验）**：卡片为**暗色玻璃 + 品牌橙霓虹发光 + 立体 3D**，明暗主题自适应；运行 app 中观感确为"科技感"（非暖色温馨风）。
8. 全部新老健康单测通过。
9. **端到端运行验证（必做）**：实际启动 app 走查第 1–7 条，并在日志/PR 描述中附结果（截图或逐条结论）。

---

## 9. 落地顺序

见配套任务计划：[health-reminder-v3-stage-plan.md](health-reminder-v3-stage-plan.md)。

---

## 10. V3.2 补充：修复 followPet「永远右下角」（真 BUG）

**现象**：设置「跟随宠物」后点测试健康卡，卡片仍出现在屏幕右下角，不跟随宠物。

**根因（已坐实，非性能/边界问题）**：命中矩形结构不匹配。
- 全项目命中矩形约定为 **`{ left, top, right, bottom }`**：`getHitRectScreen()`（[pet-geometry-main.js:30](../../../src/pet-geometry-main.js#L30)）返回此形，任务气泡 [permission.js:301](../../../src/permission.js#L301) 也按此读。
- 但 v3 的 [bubble-layout.js](../../../src/health-reminder/bubble-layout.js) 写成了 `petHitRect.width / .x / .y / .height`。守卫 `Number.isFinite(petHitRect.width)` 恒为 false（真实对象没有 `.width`）→ **followPet 分支永不执行 → 每次走右下角兜底**。
- 单测当初以臆想的 `{x,y,width,height}` 喂入，故"测试通过"却与真实集成不符——典型"测了臆想接口"。

**根治设计**：
1. `computeHealthStackLayout` 改用统一的 `{left,top,right,bottom}` 命中矩形契约；右/左/上/下候选位与"不与宠物相交、整组在工作区内、向上生长"全部按 left/right/top/bottom 重算。
2. **followPet 兜底**：候选都放不下时回退到"贴宠物的最优一侧并夹回屏内"，**不再跳屏幕角**（屏幕角仅 corner 模式）。这样 followPet 任何情况下都"跟随"。
3. **测试**：单测改真实结构；新增"喂真实 `getHitRectScreen` 形状"的集成测试，锁死契约一致、防再漂移。

**验收**：followPet 下，宠物在屏幕任意位置（含四角），测试卡都贴着宠物显示、完整不溢出、不遮挡宠物；单测/集成测试全绿；运行 app 实测留痕。

任务分解见 [stage-plan 阶段 V3.2](health-reminder-v3-stage-plan.md)。
