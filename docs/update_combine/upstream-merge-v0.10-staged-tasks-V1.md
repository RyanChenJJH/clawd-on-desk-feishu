# Clawd 上游 v0.10 合并 — 阶段任务（V1 · 可执行）

> 状态：**待评审（未动工）**。配套方案：[upstream-merge-v0.10-requirements-and-design-V1.md](upstream-merge-v0.10-requirements-and-design-V1.md)
> 日期：2026-06-19
> 原则：**Merge（不变基）** → 集成分支隔离 → 先建绿基线 → 合并 → 解 3 处冲突 → 自动化验证 → 启动冒烟 → 落地；**不破坏 Expand_function**。
> 关键事实：merge-base=`4a6d9ce`(=fork `main`=上游 #481)；上游 `main`=`15f041f`(**v0.10.0**，领先 **73**)；扩展=单提交 `7c92ec5`；**真冲突仅** `src/main.js`、`src/prefs.js`、`src/settings-renderer.js`。
> 路径约定：FORK=`E:\Work2\AI_Work\tool\clawd-on-desk\clawd-on-desk-feishu\clawd-on-desk-feishu`；UPSTREAM(本地克隆)=`E:\Work2\AI_Work\tool\clawd-on-desk\clawd-on-desk\clawd-on-desk`。

---

## 阶段 A：准备与安全网（不改任何源码）
**目标**：可复现合并源 + 零风险回滚 + 绿色基线。

- [ ] **A1** 记录起点：`git -C <FORK> status --short`、`git -C <FORK> rev-parse feature/health-reminder main`，写入合并日志。
- [ ] **A2** 备份引用：`git -C <FORK> branch backup/feature-health-reminder-premerge 7c92ec5`；`git -C <FORK> tag premerge-main 4a6d9ce`。
- [ ] **A3** 合并源：确认本地上游克隆已是最新；fork 远端 `upstream-local` 已指向该克隆并已 fetch（分析阶段已加，必要时 `git -C <FORK> fetch upstream-local`）。可选：另加 GitHub `upstream`。
- [ ] **A4** 绿基线：在 `7c92ec5` 上跑 focused 飞书/健康套件（见 §命令速查），全绿并留痕。

**涉及文件**：无（仅 git / 测试）。
**验收**：备份分支与 tag 存在；上游已 fetch；基线测试全绿且有记录。

---

## 阶段 B：建立集成分支并合并上游
**目标**：在隔离分支产生合并冲突，主分支不受影响。

- [ ] **B1** 从 `7c92ec5` 建集成分支 `merge/upstream-v0.10` 并检出（建议在当前 worktree 进行，避免影响主仓库工作区）。
- [ ] **B2** `git merge upstream-local/main`（预期 3 处冲突，其余自动合并）。
- [ ] **B3** `git status` 核对冲突集合**恰好** = {`src/main.js`, `src/prefs.js`, `src/settings-renderer.js`}；若超出此集合，**停下复核**（说明上游或扩展有新变动，需回到方案评估）。

**涉及文件**：git 合并。
**验收**：冲突集合与预期一致。

---

## 阶段 C：解决 3 处冲突（按方案 §6；顺序参考 checklist：prefs → main → settings）

### C1 — `src/prefs.js`（语义合并 v12）
- [ ] 合并为**单个 v12 迁移块**：保留上游 `if (!("showDock" in out)) out.showDock = true;` + `out.version = 12`；飞书字段由 `validate()`/schema 默认补齐。
- [ ] 核对 SCHEMA/CURRENT 版本常量仍为 **12**（未被双方各 +1）。
- [ ] 跑 `test/prefs.test.js` 绿。

### C2 — `src/main.js`（取并集）
- [ ] 保留 fork 含 `powerMonitor` 的 `require` 行 + 保留上游整块 XWayland 重启代码（#441）。
- [ ] 核对非冲突区的 fork 接线仍存活：飞书运行时创建、provider 注册表注册、完成通知、Doctor 接线、健康提醒 main 接线。

### C3 — `src/settings-renderer.js` + `src/settings-icons.js`（适配上游 SVG 图标）
- [ ] `settings-renderer.js`：采用上游无 `icon:` 结构，新增 `{ id: "healthReminder", labelKey: "sidebarHealthReminder", available: true }`（删除原 emoji 字段）。
- [ ] `src/settings-icons.js`（上游随合并带入的新文件）：新增 `healthReminder` 的内联 SVG 图标（沿用同一模式；可基于 `assets/svg/clawd-health-*.svg` 改作或新建简洁 SVG）。
- [ ] 若 `test/settings-icons.test.js` 枚举 tab id 集合，补 `healthReminder`。
- [ ] 跑 `test/settings-renderer-browser-env.test.js`、`test/settings-icons.test.js` 绿。

- [ ] **C-收尾** `git add` 三处冲突文件，**先不提交**（待阶段 E 自动化通过后再 commit 合并）。

**涉及文件**：`src/prefs.js`、`src/main.js`、`src/settings-renderer.js`、`src/settings-icons.js`、（必要时）`test/settings-icons.test.js`。
**验收**：三处冲突解决；上述针对性测试全绿；fork 接线无丢失。

---

## 阶段 D：依赖与构建对齐
**目标**：deps 与 lock 协调一致。

- [ ] **D1** `npm install`（协调上游 deps + `@larksuiteoapi/node-sdk` + 重算 `package-lock.json`）。
- [ ] **D2** `git diff --check`（无空白/冲突残留标记）。

**涉及文件**：`package.json`、`package-lock.json`。
**验收**：安装通过、无空白错误、lock 协调。

---

## 阶段 E：自动化验证（我执行并报告）
**目标**：扩展功能与上游行为均无回归；安全不变量保持。

- [ ] **E1** focused remote-approval 套件（命令见 §命令速查）。
- [ ] **E2** 健康提醒全套（`test/health-reminder-*.test.js`）+ `test/feishu-upstream-merge-checklist.test.js`。
- [ ] **E3** 针对性用例：`settings-icons`、`settings-renderer-browser-env`、`prefs`、`settings-actions`、`permission-telegram-approval`、`completion-notify-integration`。
- [ ] **E4** `npm test` 全量；若 Windows 超时，跑 checklist 核心子集并记录超时。
- [ ] **E5** 安全不变量回归：`remote-approval-broker.test.js`「provider 返回 null 绝不 settle」断言绿。
- [ ] **E6** 全绿后 `git commit` 合并结果（合并提交信息注明：上游 v0.10.0 / #523、解决的 3 处冲突）。

**涉及文件**：测试；合并提交。
**验收**：全绿（或超时项有记录 + 核心子集绿）；安全不变量绿。

---

## 阶段 F：启动冒烟（无凭据）+ 落地 + 收尾
**目标**：基本可运行 + 分支落到约定终态 + 文档留痕。

- [ ] **F1** Feishu 关闭态启动 app（`npm start`）冒烟：能起、无飞书网络运行时、本地权限气泡路径在；截图/日志留痕。
- [ ] **F2** 交付真机走查清单给你（依据 `upstream-merge-checklist.md` Manual Smoke：飞书各路径 + 健康提醒可视化/动画/设置/定位）。
- [ ] **F3** 验证通过后落地：`feature/health-reminder` 快进到 `merge/upstream-v0.10`；`main` 快进到 `upstream-local/main`（`--ff-only`）。
- [ ] **F4** 更新 `docs/Expand_function/feishu/upstream-merge-checklist.md`：追加新热点（`settings-renderer` SVG 图标、`prefs` v12 双占用）与本次结论。
- [ ] **F5** 写本次合并日志（含测试结论与超时记录）。是否 `push` 由你决定。

**涉及文件**：`docs/Expand_function/feishu/upstream-merge-checklist.md`、合并日志、git 分支落地。
**验收**：分支终态符合方案 §5.1；文档更新；日志可回溯。

---

## 命令速查（Windows / PowerShell 或 bash）

**focused remote-approval + 飞书套件**（源自你的 upstream-merge-checklist，按实际存在文件）：
```
node --test test\remote-approval-broker.test.js test\remote-approval-provider-registry.test.js test\remote-approval-payload.test.js test\remote-approval-status.test.js test\permission-telegram-approval.test.js test\completion-notify-integration.test.js test\feishu-card-builder.test.js test\feishu-approval-settings.test.js test\feishu-approval-runner.test.js test\feishu-approval-main.test.js test\feishu-approval-main-wiring.test.js test\feishu-approval-runtime-status.test.js test\feishu-upstream-merge-checklist.test.js test\doctor.test.js test\doctor-ipc.test.js test\doctor-report.test.js test\settings-renderer-browser-env.test.js
```

**健康提醒全套**：`node --test test\health-reminder-*.test.js`

**全量**：`npm test`（= `node test/run-tests.js`）

**核心子集（全量超时时）**：
```
node --test test\server.test.js test\state.test.js test\settings-actions.test.js test\prefs.test.js test\menu.test.js test\tick.test.js test\session-hud.test.js test\dashboard.test.js
```

---

## 涉及文件总览

| 类别 | 文件 |
| --- | --- |
| **冲突解决（改）** | `src/prefs.js`、`src/main.js`、`src/settings-renderer.js` |
| **适配新增/改** | `src/settings-icons.js`（上游新文件，加 healthReminder 图标）、（必要时）`test/settings-icons.test.js` |
| **依赖** | `package.json`、`package-lock.json` |
| **文档（改）** | `docs/Expand_function/feishu/upstream-merge-checklist.md`、合并日志 |
| **自动并入（无需手动）** | 其余 18 个交集文件 + 上游 73 提交全部新增/改动 |

---

## 建议执行顺序

**A → B → C（C1 prefs → C2 main → C3 settings）→ D → E → F**

任一阶段红灯：**先停、定位、再前进**；集成分支隔离保证主分支随时安全。
