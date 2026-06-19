# 健康提醒 实施日志 · P0 脚手架 + P1 纯逻辑层

> 配套：[实施计划](health-reminder-stage-plan.md)。本日志记录 P0、P1 的实际执行、关键决策与验证，
> 方便回溯。
> 日期：2026-06-15　分支：`feature/health-reminder`　方法：TDD（红→绿→重构，纵向切片）

## 1. 范围与结论

- **P0 分支与脚手架**：✅ 完成。
- **P1 纯逻辑层**（reminder-model / scheduler / quiet-hours / gate）：✅ 完成，含单测。
- 测试：**30 通过 / 0 失败**（5 个新测试文件）。
- 纯逻辑层**零 Electron 依赖**（仅 `node:crypto` + 模块内互相 require）。
- 现有套件抽样回归（prefs / settings-actions / bubble-policy）：**291 通过 / 0 失败**，无回归。
- 本阶段**未触碰任何上游文件**，全部为新增文件，对 fork 合并零冲突面。

## 2. 交付的文件

新增源码（`src/health-reminder/`，共约 547 行含测试）：

| 文件 | 公开接口 | 职责 |
| --- | --- | --- |
| `time.js` | `hhMmToParts(str)`、`hhMmToMinutes(str)` | 共享 HH:MM 解析（重构期抽取，去重三处） |
| `quiet-hours.js` | `isWithinQuietHours(now, quietHours)` | 静默时段判断，支持跨午夜 |
| `reminder-model.js` | `normalizeReminder`、`validateReminder`、`normalizeConfig`、`generateReminderId` | 提醒/配置 normalize 与校验 |
| `scheduler.js` | `computeNextFire(reminder, fromTs, { lastFiredTs })` | 下次触发时间（interval/daily + 星期） |
| `gate.js` | `shouldFire(now, ctx)`、`canPlayBodyAnimation(state)`、`BODY_FREE_STATES` | 触发闸门 + 身体动画闸门 |

新增测试（`test/`）：`health-reminder-time.test.js`(2)、`-quiet-hours.test.js`(5)、
`-model.test.js`(9)、`-scheduler.test.js`(9)、`-gate.test.js`(5)。

## 3. TDD 过程（红→绿摘要）

逐模块纵向切片，每条行为先写失败测试（RED）、再写最小实现（GREEN）：

- **quiet-hours**：禁用→false（tracer）→ 同日窗口 → 跨午夜 wrap → 边界(start 含/end 不含) → 非法/相等。
- **reminder-model**：默认值+生成 id（tracer）→ 保留合法值 → schedule 清洗(interval 夹紧/days 过滤/times 去重排序) → snooze 夹紧 → validateReminder(interval/daily) → normalizeConfig(默认 off + 嵌套提醒清洗)。
- **scheduler**：interval 无 lastFired（tracer）→ lastFired 锚定 → 长时间间隔后 roll-forward → disabled→null → daily 当日最近 → 当日已过滚到次日 → 多时刻取最早 → daily 星期过滤跳周末 → interval 星期顺延（曾 RED：无 lastFired 分支漏调 defer，已修）。
- **gate**：DND+respectDnd→false（tracer）→ 静默时段→false → 正常→true → respectDnd=false 忽略 DND → canPlayBodyAnimation 仅 idle/sleeping。

每个切片均观察到真实 RED 再转 GREEN（非批量先写测试），失败信息驱动了实现（如 scheduler 星期顺延的分支遗漏即由 RED 暴露）。

## 4. 关键设计决策（实现期固化，供后续阶段对齐）

1. **静默时段边界**：start 含、end 不含；`start>end` 视为跨午夜窗口 `[start,24:00)∪[00:00,end)`；
   start==end 或非法 HH:MM → 视为未启用（返回 false）。用本地时间 `getHours/getMinutes` 比较，
   测试用本地 Date 构造，规避时区漂移。
2. **interval 唤醒后 roll-forward**：长时间睡眠/时钟跳变后，不回放每个错过的间隔，而是跳到
   `fromTs` 之后的第一个对齐槽位（`lastFired + ceil(gap/interval)*interval`，必要时再 +1 间隔），
   保证严格晚于 now。对应方案「对齐而非累加」。
3. **interval + 星期**：算出 `next` 后若落在非允许星期，按「保留当地时刻、整日顺延」推进到下个允许日
   （最多 7 步）。比「按 interval 步进跨周末」更可预期、无长循环。
4. **daily 搜索**：从 `fromTs` 当天起扫描 8 天，命中允许星期后取该日最早的、晚于 now 的时刻；
   用 `new Date(y,m,d+offset,hh,mm)` 让 JS 自动归一化跨月/跨年，并保持当地墙钟（DST 安全）。
5. **gate 身体动画白名单**：`BODY_FREE_STATES = {idle, sleeping}`，未知状态默认「忙」（保守，
   不打断）。刻意不 `require` `state-priority.js`，让纯逻辑层零跨模块耦合、可独立单测。
6. **reminder-model 默认值/夹紧**：`enabled` 默认 true、`snoozeMinutes` 默认 10 且最小 1、
   `animationKey` 默认 "none"、`intervalMinutes` 默认 45 最小 1；`times` 过滤非法/去重/按时刻排序；
   `days` 仅取 0–6、去重升序；`normalizeConfig` 默认主开关 off，丢弃数组中的非对象项。
7. **id 生成**：`hr_` + `randomUUID` 去横线取前 12 位，稳定且无外部依赖。

## 5. 与计划的偏差（已记录）

- **P0「空文件 + 占位测试」改为「首个 TDD 切片」**：未落地无导出的空 stub，而是用第一条真实测试
  （quiet-hours tracer）驱动模块产生。既验证了测试 harness 能发现新套件，又避免死代码。更贴合 TDD。
- **新增 `time.js`（计划未列）**：重构步骤中发现三处重复的 HH:MM 解析，抽取为共享小模块去重；
  附 `health-reminder-time.test.js` 直接守护。属合理 deepening，仍在 `src/health-reminder/` 内。

## 6. 验证

```bash
# 健康提醒纯逻辑全部套件
node --test test/health-reminder-time.test.js test/health-reminder-quiet-hours.test.js \
  test/health-reminder-model.test.js test/health-reminder-scheduler.test.js \
  test/health-reminder-gate.test.js
# -> pass 30 / fail 0

# 抽样回归（未触碰其源码，作 sanity）
node --test test/prefs.test.js test/settings-actions.test.js test/bubble-policy.test.js
# -> pass 291 / fail 0
```

- `src/health-reminder/` 内无 `require("electron")`、无相对越界 require。✓
- P1 验收（四模块单测全绿、不引入 Electron）达成。✓

## 7. 下一步（P2）

- `src/prefs.js`：新增 `healthReminder` schema（参照 `feishuApproval`）+ 主题覆盖 map 的
  `healthReminders` 键与 `normalizeHealthReminderOverridesMap`。
- `src/health-reminder-settings.js` + `src/settings-actions.js`：`healthReminder.*` 命令，
  走 controller→store。
- 复用本阶段的 `normalizeConfig` / `normalizeReminder` 作为 prefs 与命令层的纯逻辑基座。
- 扩展 `test/prefs.test.js`、`test/settings-actions.test.js`。

> 提醒：P2 起将首次触碰上游热点文件，改动须小而集中、逐个加测试，并同步更新
> [上游合并检查清单](upstream-merge-checklist.md)。
