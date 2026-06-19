# 健康提醒（Health Reminder）功能文档集

> 状态：v1 + v2 已实施（TDD）。v2 详见 [v2 实施日志](health-reminder-v2-phase1-8-log.md)；
> 少数窗口层/专属 art 项按既定取舍延后（见日志「仍延后」）。健康提醒用例 315/315 通过。
> 日期：2026-06-15

桌面宠物 Clawd 的「健康提醒」功能：可设置喝水、久坐起身、午饭、下班、护眼等常用提醒，
为每条提醒配置触发时间与提醒文字，并可在「动画/音效替换」中像「反应动画」「工作态」那样
替换每个健康动画的素材。核心原则：**不打断、不改变任何现有功能**，且**对上游 fork 合并友好**。

## 文档导航

| 文档 | 作用 |
| --- | --- |
| [health-reminder-development-plan.md](health-reminder-development-plan.md) | **第一版开发方案**：目标、硬约束、架构、数据模型、不打断设计、模块边界、测试、风险、验收 |
| [health-reminder-stage-plan.md](health-reminder-stage-plan.md) | **第一版实施计划**：分阶段任务、涉及文件、每阶段测试与验收 |
| [health-reminder-animation-design-spec.md](health-reminder-animation-design-spec.md) | **健康提醒动画设计规范**：clawd/cloudling/calico 主题动画概念、首版素材清单、SVG 绘制规范 |
| [health-reminder-v2-development-plan.md](health-reminder-v2-development-plan.md) | **第二版开发方案**：动画完善（三主题全套）、提醒预设库、统计、智能调度等增强 |
| [health-reminder-v2-stage-plan.md](health-reminder-v2-stage-plan.md) | **第二版任务计划**：v2 分阶段任务 |
| [health-reminder-v2-phase1-8-log.md](health-reminder-v2-phase1-8-log.md) | **第二版实施日志**：V2-P1～P8 的 TDD 实施记录、决策、测试与延后项 |
| [health-reminder-v3-development-plan.md](health-reminder-v3-development-plan.md) | **第三版开发方案**：屏幕内定位、独立卡片上推堆叠、跟随宠物/右下角两模式、任务优先让位、3D 半透明卡片（⚠️ 有意推翻 v1 决策 #1 的「共存不打断」） |
| [health-reminder-v3-stage-plan.md](health-reminder-v3-stage-plan.md) | **第三版任务计划**：V3-P1～P7 分阶段 TDD 任务、涉及文件、验收 |
| [upstream-merge-checklist.md](upstream-merge-checklist.md) | **上游合并检查清单**：后续同步原作者更新时的操作流程与回归用例 |
| [health-reminder-bugfix-log.md](health-reminder-bugfix-log.md) | **Bug 修复日志**：上线后缺陷与修复记录（含 BUG-001 保存报错） |

## 已确认的关键决策（来自需求澄清）

1. **不打断 = 共存（而非延迟/跳过）**：健康提醒是一个**独立、常驻、可交互的气泡**，
   堆叠在任务气泡**下方**。任务气泡与健康气泡互不打断、互不取消；点击其中一个的
   「确认」不影响另一个。任务提醒始终显示在健康提醒**上方**。
2. **身体动画**：clawd 喝水这类「身体动画」**仅在宠物身体空闲时播放**；任务占用身体时
   只显示文字气泡（堆在任务下方），当身体由忙转闲且气泡仍在时**自动补播一次**；
   **绝不抢占任务的身体动画**。
3. **调度方式**：每条提醒支持「固定时刻 HH:MM」+「循环间隔 N 分钟」+「按星期/工作日」过滤。
4. **静默**：尊重现有勿扰（DND）；并可设全局静默时段（如 22:00–08:00）内不提醒。
5. **交互默认值**：「稍后再提醒」默认 +10 分钟（每条可改）；气泡常驻不自动消失；
   提供可选「无操作 N 分钟后自动收起」，默认关闭。
6. **动画首版范围**：先做 clawd 一组 4–5 个手绘像素动画，打通全链路；cloudling/calico
   先用可替换的回退槽位，**完整三主题动画与更多动画移入 v2**。
7. **侧边栏位置**：新增「健康提醒」顶级 Tab，位于「移动端」与「关于」之间。
8. **两个 UI 触点**：
   - 新「健康提醒」Tab：管理提醒条目（时间、文字、选用动画、启用、静默时段）。
   - 「动画/音效替换」新增「健康提醒动画」分组：替换每个健康动画的 SVG 素材。

## 设计基线（代码勘探结论，供实现核对）

- **状态优先级**：`src/state-priority.js` 的 `STATE_PRIORITY`（error 8 … idle 1 … sleeping 0）
  用于判断「身体是否被任务占用」。
- **覆盖层动画机制**：`src/renderer.js` 的 `playReaction()` 是瞬时身体覆盖层，主进程状态变化
  会自动取消反应——健康身体动画复刻该机制并仅在空闲时触发。
- **气泡是独立窗口**：`permission/notification/update` 各为相对宠物定位的 BrowserWindow，
  `permission.js` / `main.js` 已有 reposition 逻辑——健康气泡作为**独立窗口**堆在其下方，
  不改动现有气泡代码。
- **主题动画分组**：`themes/*/theme.json` 的 `reactions` 块是「分组动画」的范例；
  新增平行的 `healthReminders` 块。
- **动画替换分区**：`src/settings-animation-overrides-main.js` 用 `buildReactionCards()` +
  `pushSection(sections,"reactions",...)` 生成可替换分区——新增 `buildHealthReminderCards()` +
  `pushSection(sections,"health",...)`。
- **设置写入链路**：沿用 `prefs.js → settings-controller.js → settings-store.js`，
  side effects 走 `settings-actions.js`，与飞书审批一致。
