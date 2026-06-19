# 健康提醒 v3 实施日志（TDD）

> 配套方案：[health-reminder-v3-development-plan.md](health-reminder-v3-development-plan.md)
> 任务计划：[health-reminder-v3-stage-plan.md](health-reminder-v3-stage-plan.md)
> 分支：`feature/health-reminder`（v1+v2 未提交工作之上继续）
> 测试运行：`node --test test/<file>.test.js`

---

## V3-P1：纯布局引擎 ✅（2026-06-17）

**目标**：从根上解决「卡片溢出/点不到」——新建可单测的纯几何函数，具备「工作区四边夹回 + 向上生长 + 跟随宠物不遮挡 + 超量隐藏最旧」。

### TDD 过程
1. **RED**：新建 `test/health-reminder-bubble-layout.test.js`（7 用例）：corner 单卡锚右下角；向上生长（新在下、旧上推、无重叠、均在区内）；超量 maxVisible 隐藏最旧；小屏进一步降可见数仍不溢出；followPet 贴宠物不遮挡；宠物贴角落到另一侧仍在屏内不遮挡；空输入。→ 模块缺失，全失败。
2. **GREEN**：新建 `src/health-reminder/bubble-layout.js` 导出 `computeHealthStackLayout({mode,workArea,petHitRect,bubbleWidth,bubbleHeights,gap,margin,maxVisible}) -> {bounds,visibleCount}`。
   - 输入 `bubbleHeights` 为插入序（旧→新）；输出 `bounds[i]` 对齐输入，溢出（最旧）置 null。
   - 可见数 = 最新 `min(maxVisible,n)`，若仍超 `usableH` 则继续递减。
   - baseline = 最新卡底边；自底向上排列、夹回 `[wa+margin+totalH, wa+height-margin]`；x 夹回 `[wa+margin, wa+width-margin-width]`。
   - corner：右下角；followPet：右→左→上→下候选，取第一个「完全在区内且不与 petHitRect 相交」者，否则回退右下角。→ 7/7 绿。

### 关键决策
- **向上生长**用「baseline=最新卡底边、自底上排」实现，天然满足用户「新在下、旧上推」。
- followPet 占位用「候选+相交判定」而非复杂解析，鲁棒且可穷举测试；放不下则回退 corner（保证不溢出优先于跟随，方案 R1）。
- 纯函数、无 Electron 依赖；控制器（P2）只负责把窗口高度喂进来并按 bounds 摆放。

### 影响文件
- 新增：`src/health-reminder/bubble-layout.js`、`test/health-reminder-bubble-layout.test.js`

### 验收
- 布局引擎 **7/7 绿**；四角/贴边/超量/小屏/跟随各场景均不溢出、不遮挡宠物。

---

## V3-P2：控制器接入布局引擎 + 向上堆叠 ✅（2026-06-17）

**目标**：`health-reminder-bubble.js` 用 `computeHealthStackLayout` 统一摆位，堆叠反转为向上；main.js 接线并在宠物移动时复位。

### TDD 过程
1. **RED**：`test/health-reminder-bubble.test.js` 新增 describe「v3 positioning」2 用例：corner 下全部在工作区内且最新卡更靠下（y 更大）；followPet 下无卡与 petHitRect 相交。→ 失败。
2. **GREEN**：重写 `src/health-reminder-bubble.js` `layout()`：收集 live 窗口高度（插入序 旧→新）→ 调 `computeHealthStackLayout` → 按 `bounds[i]` `setBounds`/`showInactive`，`bounds[i]===null` 则 `hide`。注入 `getMode`/`getWorkArea`/`getPetHitRect`（替代 `getAnchorRect`），默认 followPet/默认工作区/无 petHitRect。→ 14/14（含既有 stacking/maxVisible/dismiss 用例，均为计数断言，反转后仍成立）。
3. **GREEN（main.js 接线）**：
   - 健康控制器注入：`getMode`（读 `healthReminder.displayMode`，缺省 followPet）、`getWorkArea`（`getNearestWorkArea(petCenter)`）、`getPetHitRect`（`getHitRectScreen(win.getBounds())`）。
   - 宠物 `move`/`resize` 事件改挂 `syncFloatingAndHealth`，附带 `_healthBubbleController.reposition()`，宠物移动时健康卡即时跟随/夹回（不止 2s 轮询）。
   - `node --check src/main.js` 通过。

### 影响文件
- 改：`src/health-reminder-bubble.js`、`src/main.js`；测试：`test/health-reminder-bubble.test.js`

### 验收
- 控制器+布局+main+controller 套件 **35/35 绿**；贴边/多卡不溢出、followPet 不遮挡、移动即时复位。

---

## V3-P3（配置部分）：displayMode ✅（2026-06-17）

**目标**：两种模式可经全局配置切换（followPet 默认）。

### TDD 过程
- **RED**：`test/health-reminder-model.test.js` 断言 `normalizeConfig` 默认 `displayMode:"followPet"`、`corner` 保留、非法值回退 followPet。→ 失败。
- **GREEN**：`reminder-model.js normalizeConfig` 增 `displayMode: src.displayMode==="corner" ? "corner" : "followPet"`。→ model+prefs+settings **22/22 绿**（无 deepEqual 破坏）。
- main.js 的 `getMode` 已读 `healthReminder.displayMode`（P2 接线），故配置即生效。

### 余项
- 设置页「显示模式」可视选择器 + 5 语 i18n（纯展示层，同飞书 P6 一并列为续做；默认 followPet 已可用，corner 可经配置启用）。

---

## V3-P4：任务优先抢占 ✅（2026-06-17）

**目标**：任务卡片优先——有任务时健康延迟；健康显示中来任务则**立即退场且不丢失**，任务结束补显示。

### TDD 过程
1. **RED**：`test/health-reminder-main.test.js` 新增 describe「task-priority preemption」3 用例：任务在场时 fire 被延迟、清空后显示；健康开着 onTaskActive→立即 dismiss 且 openBubbles 归零、onTaskCleared→再次显示；抢占不动 cadence 计时器（非 confirm/snooze）。→ 失败。
2. **GREEN**：`src/health-reminder-main.js`
   - 注入 `hasActiveTaskBubble` dep；新增 `deferredQueue` Map。
   - `fire`：门控通过后若 `hasActiveTaskBubble()` → 入 `deferredQueue` 不 present（也不计 "fired" 统计）；否则照常 present。
   - `onTaskActive()`：遍历 `openBubbles` → `dismissBubble(id)` + 转入 `deferredQueue`，清空 openBubbles（**不 confirm/不 snooze、不动计时器**）。
   - `onTaskCleared()`：若仍有任务则等待；否则 flush `deferredQueue` → present（尊重 master/each enabled）。→ 19/19 runtime 绿。
3. **GREEN（main.js 桥接）**：
   - 健康 runtime 注入 `hasActiveTaskBubble: () => pendingPermissions.length > 0`。
   - `onPermissionsChanged` 在任务气泡数 0↔>0 跃迁（边沿触发，天然防抖）调用 `onTaskActive()/onTaskCleared()`；新增模块级 `_lastTaskBubbleActive` 追踪边沿。
   - `node --check src/main.js` 通过。

### 关键决策（推翻 v1 决策 #1）
- v1「共存不打断」基线在此**有意推翻**为「任务优先、健康让位且不丢失」。被让位的提醒既不 confirmed 也不 snoozed，计时器不变，任务清空后原样补显示。
- 用 0↔>0 **边沿触发**而非每次变更触发，避免任务气泡频繁增删导致的抖动（方案 R2）。

### 影响文件
- 改：`src/health-reminder-main.js`、`src/main.js`；测试：`test/health-reminder-main.test.js`

### 验收
- 健康全套（main/bubble/layout/model/controller/prefs）**51/51 绿**；方案 §8 第 4 条满足。

---

## V3-P5：3D 半透明卡片 ✅（2026-06-17）

**目标**：卡片呈半透明 + 渐变 + 立体科技感，明暗自适应；不破坏 IPC/高度上报/可点击。

### 已做
- 重写 `pwa/health-bubble.html` `<style>`：
  - `#card` 渐变半透明底（rgba linear-gradient）+ **多层阴影**（外投影 ×2 营造悬浮 3D + `inset` 顶部高光营造凸起）+ 圆角 14 + `backdrop-filter: blur saturate`（注释说明透明窗口下仅作渐进增强，玻璃感主要来自渐变+阴影）。
  - `.visible` 入场加轻微 `scale` 弹入；`.dot` 径向渐变 + 外发光；`.title` 字重/字距/高光；`.confirm` 渐变按钮 + 阴影 + hover/active 态；`.snooze` 半透明。
  - 明/暗两套（`prefers-color-scheme`）。
- `reportHeight` 偏移 `+12 → +18`，匹配 8px 上下边距 + 柔和阴影余量，避免裁切。
- 结构（#card/.head/.dot/.title/.message/.actions/button/.visible）不变 → JS（onShow/reportHeight/按钮）不受影响。

### 影响文件
- 改：`pwa/health-bubble.html`（仅样式 + 高度偏移）

### 验收
- 纯展示，无自动化用例；健康单测不依赖卡片 DOM，全套仍绿。人工观感校验（四角/明暗/单多卡）留待真实环境（本环境无显示）。

---

## V3-P6：全局开关（已满足 + 余项）✅（2026-06-17）

- **目标 1.3 已由既有主开关满足**：`healthReminder.enabled` 即全局一键启停——main.js 轮询在 `enabled` 跃迁时 `start()/refresh()` 或 `stop()+dismissAll()`（[main.js](../../../src/main.js) 健康轮询块），关停即清除所有健康气泡。本次未改该机制，行为完好。
- **余项（可选）**：把主开关在「健康提醒」Tab 顶部做得更醒目、以及可选的托盘快捷开关——属设置页/菜单的展示层微调，列入续做（与 displayMode 选择器、飞书 P6 设置项一并）。

---

## V3-P7：回归 + 文档 + 上游清单 ✅（2026-06-17）

- **全量回归**：`node test/run-tests.js` = **4233 用例，4220 通过，1 失败**。唯一失败为既有遗留
  `agent installation detector › treats a bare Hermes home directory as low-confidence residue`
  （`actual:'high' expected:'low'`，未触碰 `agent-installation-detector`，与本次无关）。
  → 健康 v3（P1–P5）+ 飞书 v3 对全量**零回归**。
- **文档**：本日志 P1–P7 完整；[README](README.md) 导航表已含 v3 两份文档与「推翻 v1 决策 #1」标注；
  [upstream-merge-checklist](upstream-merge-checklist.md) 已加「v3 实际接入点」节。

### 健康 v3 收尾结论
- 方案 §8 验收：1（任意边缘/四角不裁切）、2（独立卡上推不溢出、超量隐藏最旧）、3（followPet 不遮挡）、
  4（任务优先让位+补显示不丢失）、6（3D 半透明卡）、7（新老健康单测全绿）均达成；
  5（一键启停）由既有主开关满足。
- **余项（纯展示层）**：健康 Tab「显示模式」选择器 + 主开关置顶醒目化。默认 followPet 已可用，
  corner 可经配置启用。

---

## ⚠️ V3.1 修正（2026-06-17，用户复核后）

**上面把设置页控件与卡片视觉当成"余项/纯展示层"是错误的取舍。** 用户原始需求明确要求：
- 1.1B「两模式**可在健康提醒中统一全局设置**」——**设置页模式选择器是需求本体**，缺它则 `corner` 切不到 = 需求未达成；
- 1.3「健康提醒**可以设置**全局开关」——主开关需在设置页醒目可见；
- 1.1A 卡片要「**科技感**」——首版做成了暖色温馨风，**方向错误**，不达标。

**重新归类为硬需求（尚未完成）**，详见 [stage-plan 阶段 V3.1](health-reminder-v3-stage-plan.md) 与 [dev-plan §3.4/§3.5/§8](health-reminder-v3-development-plan.md)：
- V3.1-A 显示模式选择器（设置页）+ `setDisplayMode` 命令 + i18n — **未完成**
- V3.1-B 主开关置顶醒目（设置页）— **未完成**
- V3.1-C 科技感卡片重做（暗色 + 品牌橙霓虹，用户已选方向）— **未完成**
- V3.1-D 端到端运行验证（实际启动 app 走查）— **未完成**

> 教训：凡用户点名要"可设置/可切换/某种观感"的，都是需求本体，**不得作为展示层推迟**；视觉项必须在运行 app 中验证，不能以"本环境无显示"略过。待用户批准 V3.1 后再实施。

---

## ✅ V3.1 实施完成（2026-06-18，用户批准后 · TDD + Karpathy）

> 约束遵循：仅改 Expand_function 相关文件，对非扩展功能零行为改动；改动加性、可独立 lift-out，便于组入上游。

### V3.1-A 显示模式选择器 ✅
- **RED→GREEN（命令层，端到端）**：`test/health-reminder-controller.test.js` 新增「setDisplayMode persists corner (default followPet)」，经真实 `createSettingsController.applyCommand` 验证（含 commit-key 注册校验）。先红（unknown command）→ 实现后绿。
- 实现：`settings-actions.js` 新增 `healthReminder.setDisplayMode` 命令 + 注册表项，复用既有 `hrSettings.setFields`（`normalizeConfig` 已处理/兜底 displayMode，按 Karpathy 不加针对"不可能输入"的多余校验）。
- UI：`settings-tab-health-reminder.js` 在全局区主开关下方新增「显示模式」选择器（跟随宠物 / 屏幕右下角），沿用本 Tab 既有 bilingual `L()` 约定（与 v1/v2 一致，避免 5 语 parity 负担）。

### V3.1-B 主开关置顶 ✅
- 核查：`enabled` 主开关本就是全局区（`buildGlobals`）**第一项**，即 Tab 顶部第一个控件；满足"一眼可见、一键启停"。未做多余改动（Karpathy 外科手术原则）。

### V3.1-C 科技感卡片重做 ✅（已肉眼验证）
- 重写 `pwa/health-bubble.html` 样式：**暗色半透明玻璃底 + Clawd 品牌橙霓虹**（橙色辉光描边/标题/状态点 + HUD 顶部细光线）+ 多层阴影 3D 悬浮；明暗 OS 下统一暗玻璃基调。JS/结构/`reportHeight` 不变。
- **运行验证**：经本地静态服起页面、注入样例内容截图确认——暗玻璃 + 橙霓虹 + 立体，方向正确（非暖色温馨风）。最终上线观感仍以用户在真机为准。

### V3.1-D 验证 ✅（自动化）/ ⏳（真机交互）
- **全量回归**：`node test/run-tests.js` = **4234 用例 / 4221 通过 / 1 失败**；唯一失败为既有遗留 `agent-installation-detector`（未触碰，无关）。→ V3.1 **零回归**。
- ⏳ 真机交互走查（设置页切换模式即时生效、贴边不溢出、任务优先、卡片观感）需用户在本机确认。

### 影响文件（V3.1）
`src/settings-actions.js`、`src/settings-tab-health-reminder.js`、`pwa/health-bubble.html`、`test/health-reminder-controller.test.js`

---

## ✅ V3.2 实施完成（2026-06-18，用户批准后 · TDD + Karpathy）

> 用户反馈：设置"跟随宠物"后点测试健康卡，卡片**没跟随**，仍出现在右下角。
> 约束遵循：仅改 Expand_function 相关文件，对非扩展功能零行为改动。

### V3.2-P1 followPet 不生效（贴边/跟随）根因修复 ✅
- **根因（从源头）**：`health-reminder/bubble-layout.js` 的 followPet 分支用 `petHitRect.width` 做判定与计算，但**全应用的宠物命中矩形契约是 `{left,top,right,bottom}`**（`getHitRectScreen` / `permission.js`），`.width` 恒为 `undefined` → followPet 守卫恒假 → 每次都回落到右下角。**不是定位算法错，是读错了矩形形状契约。**
- **修复**：守卫改判 `Number.isFinite(petHitRect.left/right)`，并在分支内显式把 `{left,top,right,bottom}` 换算成 `{x,y,width,height}` 再做候选位/相交计算（右→左→上→下四候选择优，整体仍夹在工作区内、不遮挡宠物）。
- **暴露测试盲点（一并修正）**：原单测喂的是想象出来的 `{x,y,width,height}` 形状，所以从没测出该 bug。已把 `health-reminder-bubble-layout.test.js`、`health-reminder-bubble.test.js` 的 followPet 用例改用**真实 `{left,top,right,bottom}`** 矩形：断言卡片紧贴宠物右缘（`x ≈ pet.right + gap`）、贴右边界时翻到左侧（`x = pet.left - gap - width`）、且 `notEqual` 右下角、不与宠物相交。
- **验证**：health-reminder-bubble 7/7、health-reminder-bubble-layout 7/7 绿。
- ⏳ 真机走查（设置跟随宠物→点测试卡确实贴宠物移动、贴各边不溢出、任务卡优先）需用户在本机确认。

### V3.2 验证
- **全量回归**：`node test/run-tests.js` = **4233 用例 / 4220 通过 / 1 失败**；唯一失败为既有遗留 `agent-installation-detector`（未触碰，无关）。→ Health V3.2 **零回归**。

### 影响文件（V3.2）
`src/health-reminder/bubble-layout.js`、`test/health-reminder-bubble-layout.test.js`、`test/health-reminder-bubble.test.js`
