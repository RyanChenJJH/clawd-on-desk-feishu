# Clawd 上游 v0.10 合并 — 执行日志（V1）

> 状态：**合并已完成并通过自动化验证；待你做真机/真账号走查后落地**
> 日期：2026-06-19
> 方案：[upstream-merge-v0.10-requirements-and-design-V1.md](upstream-merge-v0.10-requirements-and-design-V1.md) ｜ 任务：[upstream-merge-v0.10-staged-tasks-V1.md](upstream-merge-v0.10-staged-tasks-V1.md)

## 结果速览
- 合并提交：**`ae5b73d`**（父：`7c92ec5` 飞书扩展 + `15f041f` 上游 v0.10.0），位于集成分支 **`merge/upstream-v0.10`**。
- 真冲突 3 处，全部按方案解决；其余自动合并。
- 自动化：**4407 通过 / 13 跳过（平台）/ 1 既有环境失败（非本次合并引入）**。
- 扩展功能（健康提醒 + 飞书审批）测试全绿。
- `main` 与 `feature/health-reminder` **尚未移动**（等你走查后再快进落地）。

## 阶段执行记录

### A 准备与安全网 ✓
- 备份：分支 `backup/feature-health-reminder-premerge`(=7c92ec5)、tag `premerge-main`(=4a6d9ce)。
- 远端 `upstream-local`(本地克隆) 已 fetch（upstream main = `15f041f`）。
- 绿基线（在 7c92ec5）：focused 飞书/审批 **274/274**、健康提醒 **160/160**。

### B 集成分支 + 合并 ✓
- 从 `7c92ec5` 建 `merge/upstream-v0.10`；`git merge upstream-local/main`。
- 冲突集合 = `{src/main.js, src/prefs.js, src/settings-renderer.js}`，与 `merge-tree` 预测**完全一致**。

### C 解决 3 处冲突 ✓
| 文件 | 解法 |
|---|---|
| `src/main.js` | 并集：保留含 `powerMonitor` 的 require（运行时 line 1536 `powerMonitor.getSystemIdleTime()` 确需）+ 上游 XWayland 块 |
| `src/prefs.js` | 合为单个 v12 迁移：保留上游 `showDock` 回填；飞书字段走 `validate()`；`CURRENT_VERSION` 仍为 12（未双增） |
| `src/settings-renderer.js` (+`src/settings-icons.js`,`test/settings-icons.test.js`) | 采用上游内联 SVG 机制；去 emoji `icon`；新增 `healthReminder` 标签 + 杯子 SVG 图标 + 测试白名单 |
- 静态校验：无残留冲突标记；5 个改动文件 `node --check` 全过；main.js 飞书/远程审批/健康提醒**接线全部存活**。

### D 依赖与构建 ✓
- `npm install` 16s（electron 命中缓存），407 包；larksuite SDK + electron 就位；`package-lock.json` 已对齐并暂存；`git diff --check` 无误。
- 合并未引入新运行时依赖（仅版本 0.9.0→0.10.0 + codewhale/reasonix 脚本 + asarUnpack agents）。

### E 自动化验证 ✓
- 冲突回归校验（settings-icons / settings-renderer-browser-env / prefs / settings-actions）：**437/437**。
- focused 审批/飞书：**274/274**（含安全不变量「provider 返回 null 绝不 settle」绿）。
- 健康提醒：**160/160**。
- 全量（`node --test "test/*.test.js"`，绕开 `run-tests.js` 在 Windows 的 ENAMETOOLONG）：**4421 用例，4407 过，13 跳过，1 失败**。
- 唯一失败：`agent-installation-detector`「bare Hermes home … low-confidence」——**在 7c92ec5 基线上同样失败**（本机装了 Hermes，检测返回 high）。**属既有环境问题，非本次合并引入。**
- 合并提交 `ae5b73d` 已创建。

### F 冒烟 + 待落地
- **F1 启动冒烟 ✓**：用一次性 `--user-data-dir` 干净档启动 electron 12s——正常启动、state server 起、**飞书运行时未启动**（默认关闭正确）；仅一条无害 `togglePet` 快捷键占用告警；进程已清理，未干扰你的真实实例。
- **F2 真机走查（待你做）**：见下「交付给你的走查清单」。
- **F3 落地（待你走查通过后）**：
  ```bash
  # 在主仓库（E:\...\clawd-on-desk-feishu\clawd-on-desk-feishu）
  git checkout feature/health-reminder
  git merge --ff-only merge/upstream-v0.10     # feature 前进到 ae5b73d
  git branch -f main upstream-local/main        # main 前进到 v0.10.0 (15f041f)
  ```
- **F4 ✓**：已在 `docs/Expand_function/feishu/upstream-merge-checklist.md` 追加 v0.10 段（新热点：settings SVG 图标、prefs v12）。
- **F5 ✓**：本日志。

## 交付给你的真机/真账号走查清单（依据 upstream-merge-checklist「Manual Smoke」；仅用占位/私密本地环境）
- [ ] 飞书关闭：启动 → 无飞书网络运行时；本地权限气泡照常。
- [ ] 仅 Telegram：能收并解决一次权限请求。
- [ ] 飞书基础审批：仅配置的审批人能解决。
- [ ] 飞书富审批：建议按钮渲染，非法序号忽略。
- [ ] 飞书完成通知：默认关；显式开后发送失败不改会话状态。
- [ ] `/status`：含 DND / 待决 / Telegram / 飞书；未授权用户被忽略。
- [ ] 多接收人：全部收到卡片；第一个有效决策生效。
- [ ] DND：开启后不替用户做放行/拒绝。
- [ ] 健康提醒：可视化卡片、各动画、设置页控件、两种定位模式。

## 回滚（如需）
- 弃用集成分支即可（main/feature 未动）。已落地后：`git reset --hard backup/feature-health-reminder-premerge`（feature）/ `git reset --hard premerge-main`（main）。

## 备注
- `docs/Expand_function/**` 与本机一次性 `--user-data-dir` 均为本地/临时，未入库。
- 全程未写入真实飞书凭据/ID。
