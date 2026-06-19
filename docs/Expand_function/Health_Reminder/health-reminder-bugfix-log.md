# 健康提醒 · Bug 修复日志

> 健康提醒功能上线后的缺陷与修复记录，按时间倒序追加，便于追溯。

---

## BUG-001 · 保存提醒报错 `commit: unknown settings key healthReminder`

- **日期**：2026-06-15
- **分支**：`feature/health-reminder`
- **严重度**：高（功能不可用——任何保存健康提醒的操作都被拒绝）

### 现象

在设置里保存/新增健康提醒时报错：

```
settings key healthReminder
healthReminder.addReminder commit: unknown settings key healthReminder
```

所有 `healthReminder.*` 写入命令（addReminder / setEnabled / setQuietHours / …）都会失败，
配置无法持久化。

### 根因

设置写入链路有**两个独立的注册表**：

- `commandRegistry`：命令实现（`healthReminder.addReminder` 等）。
- `updateRegistry`：单字段更新校验器，**同时**被命令提交路径用作“提交键白名单”。

`src/settings-controller.js` 的命令提交路径（`applyCommand`）会对命令返回的 `commit` 里的
**每一个键**做防御式再校验——而它查的是 **`updateRegistry`**（不是 prefs SCHEMA）：

```js
// src/settings-controller.js  (~L426)
for (const key of Object.keys(result.commit)) {
  const entry = updates[key];           // updates = updateRegistry
  if (!entry) {
    return { status: "error", message: `${name} commit: unknown settings key ${key}` };
  }
  ...
}
```

实现健康提醒时，`healthReminder` 只加到了：

- `prefs.js` 的 `SCHEMA`（定义 + normalize）✅
- `settings-actions.js` 的 `commandRegistry`（9 个命令）✅

**漏加**了 `settings-actions.js` 的 `updateRegistry`。于是命令产出的 `{ commit: { healthReminder } }`
在控制器再校验时，`updates["healthReminder"]` 为 `undefined` → 报 `unknown settings key healthReminder`。

这是与历史上 `textScaleByDisplay` 完全相同的缺陷类别（见
`test/settings-controller.test.js` 中 “setTextScaleForDisplay end-to-end commit” 回归用例的注释）。

### 为什么没被测试发现

`test/health-reminder-settings.test.js` 直接调用 `commandRegistry["healthReminder.addReminder"](payload, {snapshot})`
并断言**返回的 `{commit}`**——**绕过了控制器**的提交校验闸门，因此命令本身正确、但端到端被拒的问题未暴露。
属于“单元测试覆盖了命令、但未覆盖控制器集成路径”的盲区。

### 修复

在 `src/settings-actions.js` 的 `updateRegistry` 中补上一条（与 `agents` / `themeOverrides` 同构，
对象字段只做 plain-object 闸门；深度清洗由 prefs `normalize: normalizeConfig` 负责）：

```js
agents: requirePlainObject("agents"),
themeOverrides: requirePlainObject("themeOverrides"),
healthReminder: requirePlainObject("healthReminder"),   // ← 新增
```

### 回归测试（先红后绿）

新增 `test/health-reminder-controller.test.js`，**通过真实控制器**端到端验证：

- `applyCommand("healthReminder.addReminder", …)` → `status:"ok"` 且配置持久化（修复前红：`unknown settings key healthReminder`）。
- `setEnabled` / `setQuietHours` 提交同样持久化。

### 验证

```bash
node --test test/health-reminder-controller.test.js test/health-reminder-settings.test.js \
  test/settings-actions.test.js test/settings-controller.test.js
# -> pass 230 / fail 0
```

### 经验教训

- **凡是命令通过 `{commit}` 写入的新 prefs 键，必须同时在 `updateRegistry` 注册校验器**（控制器据此放行提交键），
  不能只加 SCHEMA + commandRegistry。
- 命令类功能至少要有**一条经 `createSettingsController` 的端到端测试**，而不能只测命令函数返回值。
- 已在[上游合并检查清单](upstream-merge-checklist.md)的接入点清单中隐含覆盖（`settings-actions.js` 同时含命令与
  updateRegistry 校验器）；本次明确补充该校验器条目。
