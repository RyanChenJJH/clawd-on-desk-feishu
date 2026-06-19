# 健康提醒 v2 · 实施日志（V2-P1 ～ V2-P8）

> 配套：[v2 开发方案](health-reminder-v2-development-plan.md) / [v2 任务计划](health-reminder-v2-stage-plan.md)。
> 方法：TDD（先红后绿，纵向切片）。运行：`node test/run-tests.js`（自动发现 `test/*.test.js`）。
> 日期：2026-06-15
>
> **总验证**：全量 `node test/run-tests.js` → 4196 测试，4183 通过，1 失败；唯一失败为
> 既有且无关的 `agent installation detector > bare Hermes home directory`（agent 集成线工作，
> 不在本次改动集内，独立运行也失败）。健康提醒相关全部用例 315/315 通过。

## 关键决策（开工前与用户确认）

cloudling 现有素材是 **JS 脚本驱动的高保真 SVG**、calico 是 **二进制 APNG**（无法用文本生成）。
经用户确认采用「接线全做 + 延后专属 art」：

- **接线/逻辑全质量完成并测试**：theme.json 新键、下拉、触发标签、i18n、覆盖槽位、回退解析、
  导入导出、音效、智能调度、气泡体验、统计、减少动态。
- **clawd**：本次新增 5 个手绘 SMIL（v2 新键），与 v1 同基线像素风。
- **cloudling/calico**：用「更贴切的现有素材」做语义回退（改掉「全部同一张」），
  专属高保真 art（脚本 SVG / APNG）经既有「健康提醒动画」覆盖槽位后续由 art 管线补齐。

## V2-P1 — cloudling / calico 动画语义化映射

- 把两主题 `healthReminders` 从「5 键全指向同一张回退」改为「按动作气质映射到各自最贴切的现有素材」：
  - cloudling：drink→attention、stretch→conducting、eat→carrying、offwork→idle、eyerest→thinking。
  - calico：drink→happy、stretch→yawning、eat→happy、offwork→react-left、eyerest→thinking。
- 新增 `test/health-reminder-theme-assets.test.js`：**断言三主题每个 `healthReminders[key].file`
  都在该主题素材目录真实存在**（clawd→`assets/svg/`，其余→`themes/<id>/assets/`），且 cloudling/calico
  映射「已专属化」（distinct ≥ 3，杜绝退回单一回退）。这是一条永久的「悬空素材引用」防护。
- 先红（两主题 distinct=1）后绿。

## V2-P2 — 扩充动画键（breathe / posture / walk / snack / sleeptime）

- 新建 `src/health-reminder/animation-keys.js`：动画键**单一事实源** `HEALTH_ANIMATION_KEYS`（10 个）。
- clawd 新增 5 个手绘 SMIL：`assets/svg/clawd-health-{breathe,posture,walk,snack,sleeptime}.svg`
  （viewBox `-15 -25 45 45`、body `#DE886D`、eyes `#000`、`repeatCount="indefinite"`）。
- 三主题 `theme.json.healthReminders` 各补 5 键（clawd→新素材；cloudling/calico→贴切回退）。
- 设置下拉 `ANIMATION_KEYS`、`settings-tab-anim-overrides` 触发标签、`settings-i18n` 五语 `animHealth*`
  同步补齐。
- 测试：
  - theme-assets 扩展为「每主题须定义全部规范键」+ 既有存在性/专属性。
  - `test/health-reminder-clawd-svgs.test.js`：对 10 个 clawd 健康 SVG 做**轻量 XML 良构校验**
    （标签栈平衡、重复属性、规范 viewBox、含循环动画、用 clawd 调色板，且**禁止**用
    `<animate attributeName="transform">` 代替 `<animateTransform>`——开发中踩过的真实坑）。
  - `test/health-reminder-anim-i18n.test.js`：**每个规范键在五种语言都有非空标签**（守 key↔i18n 边界）。
  - i18n parity 由既有 `i18n.test.js` 保证。

## V2-P3 — 提醒预设库 + 导入导出

- `src/health-reminder/presets.js`：8 个内置模板（喝水/久坐/护眼/深呼吸/番茄钟/午饭/下班/睡觉），
  携带稳定 id + 动画键 + 默认调度 + 双语文案；`buildFromPreset(id, lang)` 实例化、`listPresets()` 目录。
- `src/health-reminder-settings.js` 新增纯函数 `exportReminders(config)`（剥离 id 的可移植信封
  `kind/version/reminders`）与 `importReminders(config, payload, {mode})`（merge/replace，逐条校验，
  **整体原子拒绝**非法信封或非法提醒，导入项重新生成 id 防冲突）。
- 命令：`healthReminder.addFromTemplate` / `exportReminders`（只读，无 commit）/ `importReminders`。
- UI：设置 Tab「从模板添加」下拉 + JSON 导入/导出交换框（纯渲染层 + 已测命令；不引入易碎的原生
  文件对话框胶水——原生文件对话框版本可在此命令核心上零成本后补）。
- 测试：`health-reminder-presets-io.test.js`（导出形状、merge/replace、裸数组、非法拒绝、模板有效性、
  **Tab `TEMPLATES` ↔ presets.js id 漂移防护**）；`health-reminder-presets-commands.test.js`
  （经真实 `createSettingsController` 端到端，复刻 BUG-001 教训确保命令过提交闸门）。

## V2-P4 — 每条提醒音效 + 预览

- 提醒模型 `sound` 字段（v1 已有）接入：编排器新增注入依赖 `playSound`，在 `present()` 播放
  `reminder.sound`。**因 `present()` 仅在 `shouldFire` 通过后调用，DND/静默自动抑制提醒音**；
  主进程 `playSound` 另行兜底全局静音/DND/冷却。
- UI：编辑表单新增提醒音下拉（none/complete/confirm，主题 `sounds` 声明的内置音）+「试听」按钮
  （走 `previewSound`，遵守 `skipped`(dnd/muted) 语义）。
- 测试：`health-reminder-sound.test.js`（fire 时播、无音不播、DND 抑制时不播、手动 test 播、
  model `sound` 归一化）。

## V2-P5 — 更聪明的调度（全部默认关闭）

- 三项纯逻辑 + 配置开关（默认 false，关 == v1 逐位一致）：
  - `onlyWhenActive`：`gate.shouldFire` 新增分支，仅在显式 `userActive===false` 时抑制；
    主进程用 `powerMonitor.getSystemIdleTime() < 120s` 作为「活跃」信号。
  - `adaptiveInterval`：`scheduler.adaptiveIntervalMinutes(base, snoozeStreak)`，每次连续「稍后」
    ×1.5、上限 3×；「知道了」清零 streak。编排器按 streak 调整 interval 重排。
  - `deferPastQuietHours`：`scheduler.deferPastQuietHours(nextTs, quietHours)`，落在静默窗内的
    触发顺延到窗口结束的下一个挂钟时刻。**实现说明**：DND 由用户手控、无可知结束点，故确定性顺延
    只针对「可配置的静默时段」，命名据实为 `deferPastQuietHours`（方案中的 deferPastDnd）。
- 配置 + 命令 `healthReminder.setSmartOptions`（布尔键循环）+ UI 三个开关。
- 测试：`health-reminder-smart-scheduling.test.js`（纯逻辑：默认值、gate、adaptive、defer 跨/同日/禁用）
  + `health-reminder-smart-runtime.test.js`（编排器接线：抑制/拉伸+确认复位/顺延；含「关 == v1」守护）。

## V2-P6 — 气泡体验增强

- **全部知道了**：编排器抽出共享 `confirmReminder(id)`，新增 `dismissAllOpen()`（对每个开着的气泡
  执行确认语义）；命令 `healthReminder.dismissAll`（注入 `dismissAllHealthReminders` 依赖，仿 testReminder）
  + IPC `health-bubble:dismiss-all` + UI 按钮。
- **可配堆叠上限**：气泡控制器 `MAX_VISIBLE` 改为注入 `getMaxVisible` 依赖；配置 `maxVisibleBubbles`
  （默认 3、clamp [1,5]）+ 命令 `setMaxVisibleBubbles` + UI 数字框。
- 测试：`health-reminder-bubble.test.js`（**fake BrowserWindow**：≤max 可见、其余排队、dismissAll 全毁、
  释放槽位补位；配置默认/clamp）。期间修正了 fake 的 `did-finish-load` 时序（真实为异步，
  需在窗口注册后再 flush），避免「假绿」。
- **延后项（已记录）**：气泡**实时拖拽 + 记忆偏移**、**mini 模式适配**属窗口管理器/渲染层胶水，
  难以单测、价值次之，按既定「逻辑优先」取舍延后；覆盖槽位与配置结构已就绪，后续可补。

## V2-P7 — 本地统计（opt-in，严格本地）

- `src/health-reminder/stats.js`：纯计数 `emptyStats / normalizeStats / recordEvent`
  （总计 + 按提醒细分，不可变更新，未知事件忽略）。
- 配置 `statsEnabled`（默认 false）+ `stats`；编排器新增 `recordStat` 依赖，**仅在 statsEnabled 时**
  在 fire/confirm/snooze 处计数。
- 命令 `setStatsEnabled` / `clearStats` / `recordStat`（**关时为 no-op**，杜绝旧运行时偷偷记录）。
  主进程 `recordStat` 依赖转发到该命令。UI：开关 + 计数展示 + 清空。
- **隐私**：`exportReminders` 信封**绝不含 stats**——加测试 `never leaks stats into the portable export`
  断言导出里没有任何计数字段。
- 测试：`health-reminder-stats.test.js`（纯计数、配置默认、导出排除、运行时按开关计/不计）
  + 控制器端到端（关→no-op、开→计数、清空）。

## V2-P8 — i18n + 无障碍 + 文档 / QA

- **减少动态**：配置 `reduceMotion`（默认 false）→ 编排器 `present()` 在其开启时**跳过身体动画**
  （气泡/文字仍显示）；并入 `setSmartOptions` + UI 开关。测试在 `health-reminder-main.test.js`。
- **i18n**：气泡按钮 `HEALTH_BUBBLE_LABELS` 已五语齐全；侧栏 + `animHealth*` 五语在 P2 完成
  （parity 由 `i18n.test.js` 守护）。**健康提醒 Tab 沿用 v1 既定的本地 zh/en 双语**——这是 v1 明确写在
  文件头的 fork 合并友好取舍（避免为每个控件向 parity 校验的 settings-i18n 增删键），本次延续，
  故五语 parity 仍满足。
- **文档**：更新本日志、v2 任务计划勾选、[上游合并检查清单](upstream-merge-checklist.md) 的 v2 接入点、
  setup/known-limitations/release note、README 索引。
- **QA**：全量回归如上（4183/4184 通过，唯一失败无关）。真实 Electron 窗口手测受构建环境无显示限制，
  建议在桌面环境按合并清单冒烟项逐条核验。

## 新增 / 改动文件一览

**新增源文件**：`src/health-reminder/animation-keys.js`、`presets.js`、`stats.js`；
`assets/svg/clawd-health-{breathe,posture,walk,snack,sleeptime}.svg`。

**改动源文件**：`src/health-reminder/reminder-model.js`（v2 配置字段）、`scheduler.js`（adaptive/defer）、
`gate.js`（onlyWhenActive）、`health-reminder-settings.js`（import/export）、`health-reminder-main.js`
（playSound/smart/dismissAllOpen/recordStat/reduceMotion）、`health-reminder-bubble.js`（getMaxVisible）、
`settings-actions.js`（新增命令）、`settings-tab-health-reminder.js`（UI）、`settings-tab-anim-overrides.js`
（触发标签）、`settings-i18n.js`（animHealth* 新键）、`main.js`（powerMonitor + 运行时依赖 + dismiss-all IPC）、
`themes/{clawd,cloudling,calico}/theme.json`（新键）。

**新增测试**：`health-reminder-theme-assets / clawd-svgs / anim-i18n / presets-io / presets-commands /
sound / smart-scheduling / smart-runtime / bubble / stats`；并扩展 `health-reminder-main`、
`health-reminder-controller`。

## 仍延后（诚实记录）

- cloudling/calico **专属高保真健康动画**（脚本 SVG / APNG）——经覆盖槽位由 art 管线补齐。
- 气泡**实时拖拽 + 偏移记忆**、**mini 模式**专门适配——窗口管理器/渲染层胶水，待后续。
- 导入导出的**原生文件对话框**版本（当前为 Tab 内 JSON 交换框；命令核心已就绪）。
