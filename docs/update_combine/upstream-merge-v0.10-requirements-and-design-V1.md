# Clawd-on-desk 上游更新合并到飞书 Fork — 需求与方案（V1）

> 状态：**待评审（未动工）** — 你同意后才开始实施
> 版本：**V1**
> 日期：2026-06-19
> 配套任务文档：[upstream-merge-v0.10-staged-tasks-V1.md](upstream-merge-v0.10-staged-tasks-V1.md)
> 合并准则基准：`docs/Expand_function/feishu/upstream-merge-checklist.md`（先保上游行为，再以最小接线重挂扩展；扩展默认关闭、模块化、不影响扩展外功能）

---

## 1. 背景

- 你的项目 `clawd-on-desk-feishu`（remote: `RyanChenJJH/clawd-on-desk-feishu`）是 `rullerzhou-afk/clawd-on-desk` 的 fork，二次开发新增了 **Expand_function**：
  - **健康提醒 Health Reminder**（v1+v2+v3+v3.1+v3.2）
  - **飞书远程审批 Feishu Remote Approval**（v1+v2+v3+v3.1+v3.2）
- 原作者持续更新了上游，你已把上游克隆/更新到本地：
  `E:\Work2\AI_Work\tool\clawd-on-desk\clawd-on-desk\clawd-on-desk`
- 诉求：把上游更新合并进 fork，**不破坏 Expand_function**，冲突处显式列出并给推荐解法。

## 2. 目标与非目标

**目标**
- **G1** 将上游 `main`（**v0.10.0 / #523**）的更新**全部并入** fork。
- **G2** Expand_function（健康提醒 + 飞书审批）的功能、测试、"默认关闭"语义全部保持不变。
- **G3** 冲突显式列出并按推荐方案解决。
- **G4** 自动化测试全绿；真账号飞书与可视化健康提醒由你按清单走查。

**非目标（本次不做）**
- 与本次合并无关的重构。
- 改动核心 agent hook 安装器等"扩展外"行为（如确需，另行批准）。
- 在任何文件/提交/文档中写入真实飞书 App ID / Secret / open_id / token 等。

## 3. 现状核实（只读分析结论，未改动任何代码）

### 3.1 仓库拓扑 —— 理想形态
| 项 | 值 |
|---|---|
| merge-base（两仓库共同祖先） | `4a6d9ce`（上游 PR #481） |
| 你的 fork `main` HEAD | `4a6d9ce` —— **恰好等于 merge-base** |
| 上游 `main` HEAD | `15f041f`（#523，版本 **v0.10.0**） |
| 上游领先 fork | **73 个提交** |
| fork 领先上游 | **0 个提交**（你的 main 完全干净，无私有改动） |
| Expand_function | **单个提交 `7c92ec5`**（分支 `feature/health-reminder`），直接坐在 `4a6d9ce` 之上 |

> 含义：这是最理想的 fork 形态——"干净的上游基线 + 一个扩展提交"。合并风险极低、可重复。

### 3.2 Expand_function 足迹（`4a6d9ce → 7c92ec5`）
- **新增 76 个文件**（健康提醒 / 飞书 / 远程审批模块、SVG 资源、大量测试）→ **零冲突风险**。
- **修改 37 个既有文件** → 潜在冲突来源。
- 删除 0 个。
- 新增依赖：`@larksuiteoapi/node-sdk@^1.66.1`。

### 3.3 冲突面（已用 `git merge-tree` 只读三方试合并验证）
- 37 个修改文件中，与上游 73 提交有交集的 = **21 个**。
- 其中 Git 三方合并**真正产生冲突的只有 3 个**；其余 18 个（含 `package.json`、`package-lock.json`、`settings.html`、`settings.css`、`renderer.js`、`permission.js`、`settings-actions.js`、`theme-variants.js`、各 i18n / test 等）**自动干净合并**（双方改动落在不同区域）。

**真冲突 3 文件**：`src/main.js`、`src/prefs.js`、`src/settings-renderer.js` —— 详见 §6。

### 3.4 上游 73 提交带来什么（v0.10.0）
Linux/Wayland 的 XWayland 启动修复（#441）、macOS/tmux/Ghostty/Windows 焦点修复、Telegram 审批改进（原子认领 #466、卡片回写结局 #457）、设置侧栏 emoji→**内联 SVG 图标**（#521）、新 agent 集成 **Reasonix CLI** 与 **CodeWhale**、**拖文件夹到宠物开终端**（#459）、**自由漫步模式**、**菜单重组**（#523）、Windows 位置持久化修复、`showDock` 默认迁移、版本号 `0.9.0 → 0.10.0`。

## 4. 需求确认（你已拍板的 4 项决策）

| 决策点 | 你的选择 |
|---|---|
| **合并方式** | **Merge 合并** —— 不改写历史、无需 force-push，与你 checklist 里的 `git merge` 一致 |
| **分支终态** | **`main` 镜像上游 v0.10.0（不含扩展）；上游+扩展集成结果落 `feature/health-reminder`** |
| **合并范围** | **全部并入**（含 Reasonix、CodeWhale、自由漫步、拖文件夹、菜单重组、SVG 图标等） |
| **验证深度** | **自动化（focused + 全量）我做 + 无凭据启动冒烟；真账号飞书与可视化健康提醒你走查** |

## 5. 合并方案（总体）

### 5.1 分支与终态
- 新建集成分支 **`merge/upstream-v0.10`**（从 `7c92ec5` 起）；合并与解冲突全部在此进行，**验证通过前不动 `feature/health-reminder` 与 `main`**。
- 验证通过后：
  - `feature/health-reminder` **快进**到集成结果（上游 v0.10.0 + Expand_function）。
  - `main` **快进**到上游 v0.10.0（`15f041f`，干净镜像；因 main 是其祖先，可 `--ff-only`）。
- 合并前打安全快照（见 §10 回滚）。

### 5.2 合并源
- 以**本地上游克隆**为合并源（你已更新到本地，所见即所合）。分析阶段已在 fork 加远端 `upstream-local` 指向该克隆并 fetch。
- 建议（可选）另加 GitHub `upstream` 远端，便于将来同步对比。

### 5.3 "不影响 Expand_function" 的保证（落实你的 upstream-merge-checklist 原则）
- **先保上游行为**，再以最小接线重挂 fork provider；上游热点文件只做小接线，不做大改写。
- 飞书**默认关闭**；Telegram / 本地权限气泡 / DND / agent hooks 行为不变。
- fork 专属逻辑留在 `src/remote-approval/` 与 `feishu-*` 模块。
- **安全不变量**（provider 返回 `null`/超时/中止 时**绝不** settle broker、**绝不**放行本地工具）回归锁定（`remote-approval-broker.test.js`）。

## 6. 三处冲突 —— 推荐解法

### 冲突 1：`src/main.js`（1 处 · 取并集即可）
- **fork 侧**：在 electron `require` 解构里加入 `powerMonitor`。
- **上游侧**：在该 `require` 之后插入 Linux/Wayland XWayland 重启块（#441，纯新增代码）。
- **推荐**：**两者都要** —— 保留 fork 含 `powerMonitor` 的 `require` 行 + 保留上游整块 XWayland 代码。二者无语义冲突，Git 仅因相邻行而报冲突。
- **合并后核对（非冲突区也要确认存活）**：飞书运行时创建、remote-approval provider 注册表注册、完成通知、Doctor 接线、健康提醒 main 接线 —— 均应仍在。

### 冲突 2：`src/prefs.js`（1 处 · 语义合并）
- 双方都写了迁移 **v11→v12**：
  - **fork**：为飞书设置占位（仅 `out.version = 12` + 注释；实体字段由 `validate()` 按 schema 默认补齐）。
  - **上游**：`showDock` 全新默认回填（`if (!("showDock" in out)) out.showDock = true;`）。
- **推荐**：**合并为同一个 v12 迁移块** —— 保留上游 `showDock` 回填 + 版本号 = 12；飞书字段继续由 `validate()`/schema 默认提供。
- **必查**：SCHEMA/CURRENT 版本常量是否仍为 **12**（避免被双方各 +1 误成 13）；`test/prefs.test.js` 的迁移断言对齐；启动后读现有 prefs 不被破坏。

### 冲突 3：`src/settings-renderer.js`（1 处 · 适配上游新机制）
- 上游 #521（commit `7cbcf36`）把侧边栏从 emoji 字形改为**内联 SVG 图标**：新增 `src/settings-icons.js`（暴露 `globalThis.ClawdSettingsIcons.getIcon(tabId)`，按 tab id 取 SVG），并**去掉**了各条目的 `icon:` emoji 字段。
- **fork 侧**：新增了带 emoji 的 `{ id: "healthReminder", icon: "🧋", labelKey: "sidebarHealthReminder", available: true }`。
- **推荐**：
  1. 采用上游结构（去掉 `icon:` 字段），保留并新增 `{ id: "healthReminder", labelKey: "sidebarHealthReminder", available: true }` 于 fork 原位置。
  2. 在随合并带入的新文件 `src/settings-icons.js` 中**新增 `healthReminder` 的内联 SVG 图标**（沿用同一模式；可基于现有 `assets/svg/clawd-health-*.svg` 之一改作图标，或新建一个简洁 SVG）。
  3. 若 `test/settings-icons.test.js` 枚举了期望 tab id 集合，同步补 `healthReminder`。

## 7. 语义风险（非文本冲突 · 需在验证阶段确认）

| 风险 | 说明 | 对策 |
|---|---|---|
| 飞书 vs 上游 Telegram 演进 | 上游更新了 Telegram 审批（原子认领 #466、卡片回写结局 #457），而 fork 把审批重构进 `remote-approval` provider 抽象。文本不冲突，但行为需确认。 | 跑 `permission-telegram-approval`、`completion-notify-integration`、`feishu-upstream-merge-checklist` 测试；对照 checklist「Telegram only」走查。 |
| prefs 迁移版本双占用 | 见冲突 2。 | `test/prefs.test.js` + 启动后读现有 prefs。 |
| 设置侧栏 SVG 适配 | 健康提醒标签需接上游 SVG 机制（见冲突 3）。 | `settings-renderer-browser-env`、`settings-icons` 测试 + 启动看侧栏。 |
| `package-lock.json` 一致性 | lock 文本自动合并，但需与新 deps 协调。 | 合并后 `npm install` 重新校准，提交协调后的 lock。 |

## 8. 验证与完成标准（DoD）

**自动化（我执行并报告）**
- 合并**前**先跑 focused 飞书/健康套件建立**绿基线**（任何合并后红灯可归因到合并）。
- 合并**后**跑：checklist 的 focused remote-approval 套件 + 健康提醒全套 + `feishu-upstream-merge-checklist.test.js`。
- `npm test` 全量；若 Windows 超时，至少跑 checklist 列的核心子集，并记录超时。
- `npm install` 通过；`git diff --check` 无空白错误。
- **Feishu 关闭态启动 app 冒烟**：能启动、无飞书网络运行时、本地权限气泡路径在。

**真机 / 真账号（你走查，依据 upstream-merge-checklist「Manual Smoke」）**
- 飞书关闭 / 仅 Telegram / 飞书基础审批 / 富审批 / 完成通知 / `/status` / 多接收人 / DND。
- 健康提醒：可视化卡片、各动画、设置页控件、两种定位模式。

**DoD** = 自动化全绿（或超时项有记录 + 核心子集绿）+ 启动冒烟通过 + 真机走查清单交付（勾选由你完成）。

## 9. 交付物
- 集成分支 `merge/upstream-v0.10`（验证后并入 `feature/health-reminder`）。
- `main` 快进到上游 v0.10.0（干净镜像）。
- 更新后的 `docs/Expand_function/feishu/upstream-merge-checklist.md`（追加本次新学到的热点：`settings-renderer` SVG 图标、`prefs` v12 双占用）。
- 本 `update_combine/` 两份 V1 文档 + 一份合并日志。

## 10. 回滚方案（零风险）
- 合并前创建：`git branch backup/feature-health-reminder-premerge 7c92ec5`、`git tag premerge-main 4a6d9ce`。
- 出问题：弃用集成分支即可；`feature/health-reminder` 与 `main` 在验证通过前**完全未动**，无需回滚。
- 若已落地后才发现问题：`git reset --hard backup/feature-health-reminder-premerge`（feature）/ `git reset --hard premerge-main`（main）。

## 11. 文档与约定说明
- `docs/Expand_function/**` 与 `PLAN.md` 受 `.gitignore` 忽略 → 你的规划文档为"本地不入库"约定。
- 本两份文档置于 `update_combine/`（非 `docs/`、文件名非 `plan.md`，故**可被 git 跟踪**）；是否提交由你决定（默认本地保留，与你的约定一致）。
- 全程严禁写入真实飞书凭据 / ID（仅用占位符或你的私密本地环境）。
