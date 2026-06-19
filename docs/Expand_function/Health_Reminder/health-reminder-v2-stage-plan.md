# 健康提醒第二版任务计划（分阶段）

> 配套：[v2 开发方案](health-reminder-v2-development-plan.md)。全部为 v1 之上的增量，
> 每阶段独立可测、可回滚，默认关闭项不影响既有行为。
> 日期：2026-06-15
>
> **状态（2026-06-15）**：V2-P1～P8 已按 TDD 实施完成，详见
> [v2 实施日志](health-reminder-v2-phase1-8-log.md)。少数窗口层/专属 art 项按既定「逻辑优先 +
> art 延后」取舍延后（cloudling/calico 专属高保真动画、气泡实时拖拽、mini 适配、导入导出原生文件
> 对话框）——见日志「仍延后」。健康提醒用例 315/315 通过。

## 阶段总览

| 阶段 | 主题 | 依赖 | 产出 |
| --- | --- | --- | --- |
| V2-P1 | cloudling/calico 动画专属化 | v1 P3/P4 | 两主题 5 个专属健康动画，替换回退素材 |
| V2-P2 | 扩充动画键 | V2-P1 | breathe/posture/walk/snack/sleeptime + 下拉/标签 |
| V2-P3 | 提醒预设库 + 导入导出 | v1 P2/P6 | 模板一键添加；提醒集 import/export |
| V2-P4 | 音效接入 | v1 P5 | 每条提醒 sound + 预览 |
| V2-P5 | 智能调度（默认关闭） | v1 P5 | onlyWhenActive/adaptiveInterval/deferPastDnd |
| V2-P6 | 气泡体验增强 | v1 P5 | 全部知道了/可配堆叠/可拖动/mini 适配 |
| V2-P7 | 本地统计（opt-in） | v1 P5 | fired/confirmed/snoozed 计数 + 清空 |
| V2-P8 | i18n + 无障碍 + 文档/QA | 全部 | 五语全覆盖、减少动态降级、文档与回归 |

---

## V2-P1 — cloudling / calico 动画专属化

- [ ] 按[动画规范 §4](health-reminder-animation-design-spec.md) 绘制 cloudling 5 个 `cloudling-health-*.svg`。
- [ ] 绘制 calico 5 个 `calico-health-*.svg`。
- [ ] 更新两主题 `theme.json.healthReminders` 指向新文件（取代 v1 回退）。
- [ ] 替换分区预览 + 手动检视三主题一致性。

验收：三主题同键动作气质统一、无跳位；回退素材不再被引用。

---

## V2-P2 — 扩充动画键

- [ ] 各 `theme.json.healthReminders` 增加 breathe/posture/walk/snack/sleeptime（缺素材回退）。
- [ ] 设置 animationKey 下拉与 `settings-tab-anim-overrides` 触发标签同步新增。
- [ ] clawd 先做新键素材；cloudling/calico 可回退，后续补。

验收：新键可在提醒中选用、可在替换分区调整；缺素材回退不破画面。

---

## V2-P3 — 提醒预设库 + 导入导出

- [ ] 设置 Tab 增「从模板添加」，内置常用模板。
- [ ] `healthReminder.exportReminders/importReminders` 命令（复刻动画覆盖 import/export 体验）。
- [ ] 测试：模板写入、导入合并、导出形状、非法导入拒绝。

验收：一键添加可用；提醒集可导入导出且不含敏感信息。

---

## V2-P4 — 音效接入

- [ ] 每条提醒 `sound` 字段接入既有音效体系 + 预览（遵守 DND/静音 skipped 语义）。
- [ ] 测试：选音/预览/无音回退。

验收：提醒可带音、可预览；静音/DND 下不强行出声。

---

## V2-P5 — 智能调度（默认关闭）

- [ ] `onlyWhenActive`（复用鼠标空闲判定）、`adaptiveInterval`、`deferPastDnd`（带上限）。
- [ ] 纯逻辑入 scheduler/gate，扩展单测覆盖。
- [ ] 全部默认 false。

验收：开启后行为正确、关闭后与 v1 逐位一致。

---

## V2-P6 — 气泡体验增强

- [ ] 「全部知道了」清空全部健康气泡。
- [ ] 堆叠可视上限/排队策略可配（v1 固定 N=3）。
- [ ] 气泡可拖动重定位并记忆偏移。
- [ ] mini 模式适配。
- [ ] 测试：堆叠/排队/清空/拖动记忆。

验收：堆积可控、交互顺手；mini 模式不破。

---

## V2-P7 — 本地统计（opt-in）

- [ ] 本地记录 fired/confirmed/snoozed 与温和计数；默认关闭；提供清空。
- [ ] 严格本地，禁止进入任何远程通道（加测试断言）。

验收：开启后计数正确；关闭后无记录；无任何外发。

---

## V2-P8 — i18n + 无障碍 + 文档/QA

- [ ] 提醒 Tab 与气泡五语全覆盖。
- [ ] 接入「减少动态」：健康身体动画降级。
- [ ] 更新 setup/known-limitations/release note；跑回归 + `npm test`；手动 QA。
- [ ] 更新[上游合并检查清单](upstream-merge-checklist.md)。

验收：五语完整、降级生效、全测试通过、文档与代码一致。

---

## 顺序与并行

- V2-P1/P2（动画）可与 V2-P3–P7（功能）并行，互不阻塞。
- V2-P5/P7 为默认关闭增量，风险隔离，最后合入。
- V2-P8 收尾。
