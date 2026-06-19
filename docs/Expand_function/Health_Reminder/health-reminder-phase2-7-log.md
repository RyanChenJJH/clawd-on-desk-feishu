# 健康提醒 实施日志 · P2–P7（prefs/命令 → 主题/替换 → 动画 → 运行时 → 设置UI → 收尾）

> 配套：[实施计划](health-reminder-stage-plan.md)、[P0–P1 日志](health-reminder-phase0-1-log.md)。
> 日期：2026-06-15　分支：`feature/health-reminder`　方法：TDD（可测逻辑红→绿；Electron外壳/美术/文档为实现+结构校验）

## 1. 范围与结论

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| P2 prefs + settings-actions | ✅ | `healthReminder` schema + 主题覆盖 `healthReminders` + `healthReminder.*` 命令 |
| P3 主题块 + 健康提醒动画替换分区 | ✅ | 三主题 `healthReminders` 块 + 动画替换全链路（卡片/命令/运行时应用） |
| P4 clawd 动画素材 | ✅ | 5 个 `clawd-health-*.svg`（喝水/伸展/吃饭/下班/护眼），均为合法、循环的像素风 SVG |
| P5 运行时编排 + 气泡窗口 + 渲染钩子 | ✅ | 编排器(单测)+独立气泡窗口+渲染层覆盖层复用+main.js 防御式接线 |
| P6 设置 Tab + 侧栏 + i18n | ✅ | 「健康提醒」Tab（移动端与关于之间）、五语侧栏标签、CSS |
| P7 文档 / 回归 / 合并清单 | ✅ | 本日志 + known-limitations + 合并清单实际接入点 + 全量回归 |

**全量测试：4112 项，4099 通过，1 失败。** 唯一失败为 `agent-installation-detector.test.js`（检测置信度断言），
**与本功能无关、非本次改动引入**（该文件不在本次 changeset 内，且单独运行亦失败，属上游/在途
agent-integration 工作的既有失败）。健康提醒相关全部测试通过。

## 2. 新增文件（fork 自有）

- `src/health-reminder-settings.js` — 纯配置变更助手（add/update/remove/reorder/setFields），供命令层调用。
- `src/health-reminder-main.js` — 运行时编排器（工厂 + 注入依赖；定时/闸门/气泡/补播）。
- `src/health-reminder-bubble.js` — 独立常驻气泡窗口栈管理（注入 Electron 依赖）。
- `src/preload-health-bubble.js` + `pwa/health-bubble.html` — 气泡窗口 preload + 标记/样式/脚本。
- `src/settings-tab-health-reminder.js` — 「健康提醒」设置 Tab（双语内容 helper）。
- `themes/clawd/assets/clawd-health-{drink,stretch,eat,offwork,eyerest}.svg` — clawd 健康动画。
- 测试：`test/health-reminder-{prefs,settings,anim-overrides,main,tab}.test.js`。

## 3. 现有文件接入点（小而集中，均带测试或结构校验）

| 文件 | 改动 |
| --- | --- |
| `src/prefs.js` | `healthReminder` schema（默认 off，normalize 用纯逻辑 `normalizeConfig`）；主题覆盖 map 加入 `healthReminders` 键 + `normalizeHealthReminderOverridesMap` |
| `src/settings-actions.js` | 注册 9 个 `healthReminder.*` 命令；require `health-reminder-settings` |
| `src/settings-actions-theme-overrides.js` | `setAnimationOverride` 新增 `healthReminder` slotType + `cloneHealthReminderOverrides` + `buildThemeOverrideMap` 纳入 healthReminders（含另两处 rebuild 调用） |
| `src/theme-variants.js` | `applyUserOverridesPatch` 新增 healthReminders 分支（加载期把覆盖应用到 `theme.healthReminders`） |
| `src/settings-animation-overrides-main.js` | `buildHealthReminderCards` + `pushSection("health")` + 后处理循环跳过 health |
| `src/settings-tab-anim-overrides.js` | health 分区标题 + 5 个触发标签 |
| `src/settings-i18n.js` | `animOverridesSectionHealth`+5 动画标签 + `sidebarHealthReminder`（全部五语） |
| `src/settings-renderer.js` | `SIDEBAR_TABS` 在 mobile 与 about 间插入 healthReminder；init 新 Tab |
| `src/settings.html` / `src/settings.css` | 引入 tab 脚本；新增 `.hr-*` 样式 |
| `src/renderer.js` / `src/preload.js` | `onPlayHealthReminder` → 复用 `playReaction` 覆盖层 |
| `src/main.js` | 健康提醒运行时 + 气泡控制器 + IPC + 轮询接线（整体 try/catch 防御）；注入 `triggerHealthReminderTest` dep |
| `themes/{clawd,cloudling,calico}/theme.json` | 新增 `healthReminders` 块（clawd 专属素材；cloudling/calico 回退到现有表情） |

## 4. 关键实现决策

1. **命令为纯 snapshot→{commit} 变换**：`healthReminder.*` 复用 P0–P1 的 `normalizeConfig`/`normalizeReminder`，
   逻辑放 `health-reminder-settings.js`，settings-actions 仅薄包装。`testReminder` 走注入 dep。
2. **覆盖与反应动画完全同构**：prefs 归一、`setAnimationOverride` 分支、`applyUserOverridesPatch`、
   anim-overrides 卡片四处都精确镜像 `reactions`，因此“像反应动画那样替换健康动画”免新机制。
   health 键不用固定白名单（允许任意非空键），v2 增键无需改 prefs。
3. **编排器注入式、可单测**：`createHealthReminderRuntime(deps)` 注入 now/timer/config/state/dnd/
   showBubble/dismissBubble/playBodyAnimation。14 项单测覆盖：调度、master off、cadence、
   idle 播身体动画、busy 仅气泡、busy→idle 补播一次、none 跳过、DND/静默不弹、confirm/snooze/test/stop。
4. **气泡独立窗口**：`health-reminder-bubble.js` 独立 BrowserWindow 栈（非聚焦、置顶、最多 3 可见），
   定位在宠物下方——结构上保证与任务气泡互不打断，且零改动上游 permission 气泡代码。
5. **身体动画复用反应覆盖层**：渲染层 `onPlayHealthReminder` 直接调用既有 `playReaction`，
   天然继承“任务状态变化即取消覆盖层”的安全网；又因仅在 idle 触发，正常不冲突。
6. **main.js 防御式接线 + 2s 轮询**：未找到现成的“状态变化/设置变化”事件钩子，改用 2s 轮询：
   ①busy→idle 补播；②检测 `healthReminder` 配置签名变化即 start/refresh/stop（免重启生效）。
   整块 try/catch，所有协作者读取均有空值保护——绝不影响启动或既有功能。`.unref()` 不阻塞退出。
7. **Tab 内容双语 helper**：为不触动 i18n 五语 parity 校验，Tab 正文用本地 `L(zh,en)`；
   仅侧栏标签 `sidebarHealthReminder` 进 settings-i18n（五语补齐）。

## 5. 与计划的偏差（已记录）

- **测试尽量新增独立文件**（health-reminder-prefs/settings/anim-overrides/main/tab.test.js），
  仅对 `settings-animation-overrides-main.test.js` 追加 1 条 health 分区断言（复用其 harness），
  最大限度降低上游测试文件改动面。
- **气泡高度自适应**：preload/html 预留 `reportHeight`，但 main 暂未接线（用默认高度），
  以降低风险；长文本可能裁切，列为已知限制（见下）。
- **Tab 正文未进 i18n**：用双语 helper 即时切换（zh/en），zh-TW/ko/ja 正文回退英文；
  侧栏标签五语齐全。完整 Tab i18n 列入 v2。

## 6. 验证

```bash
# 健康提醒全部单测（独立）
node --test test/health-reminder-time.test.js test/health-reminder-quiet-hours.test.js \
  test/health-reminder-model.test.js test/health-reminder-scheduler.test.js \
  test/health-reminder-gate.test.js test/health-reminder-prefs.test.js \
  test/health-reminder-settings.test.js test/health-reminder-anim-overrides.test.js \
  test/health-reminder-main.test.js test/health-reminder-tab.test.js
# 接入点回归
node --test test/prefs.test.js test/settings-actions.test.js \
  test/settings-actions-theme-overrides.test.js test/settings-animation-overrides-main.test.js \
  test/theme-override.test.js test/i18n.test.js test/settings-renderer-browser-env.test.js
# 全量
node test/run-tests.js   # 4112 / pass 4099 / fail 1 (agent-installation-detector, 既有且无关)
```

- 全部编辑源文件 `node --check` 通过。
- 三主题 `theme.json` 合法 JSON；5 个健康 SVG 合法且含 `repeatCount="indefinite"`。
- `healthReminder.enabled=false`（默认）时：运行时不 start、无气泡窗口、无 IPC 副作用。

### 待真实环境手动 QA（无显示环境无法跑）

1. 启用 + interval 1 分钟：空闲→身体动画+气泡；运行任务→仅气泡堆在任务下方，任务不被打断；忙转闲→补播一次。
2. 「知道了」「稍后(默认10分钟)」结算正确，不影响任务气泡。
3. DND/静默时段内不提醒。
4. 「动画/音效替换 → 健康提醒动画」替换 drink 素材后，提醒与预览使用新素材。
5. 关闭主开关→无提醒、无残留气泡窗口。
6. 气泡长文本高度（确认默认高度是否需接线 reportHeight）。

## 7. 已知限制（v1）

- cloudling/calico 健康动画为回退素材（复用现有表情）；专属动画在 v2。
- 健康气泡使用默认高度，超长 message 可能裁切（reportHeight 已预留，未接线）。
- 配置变更经 ~2s 轮询生效（非事件驱动）；身体动画补播延迟 ≤2s。
- 设置 Tab 正文仅 zh/en（其余语言回退英文）；侧栏标签五语齐全。

## 8. 下一步

- 真实环境手动 QA（见 §6）。
- 按需接线气泡 reportHeight；评估用事件钩子替换 2s 轮询。
- 更新 release note；提交（P0–P7 可分阶段 commit，便于回看）。
