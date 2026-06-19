AGENTS.md

## Fork 维护规范（本仓库是 nicepkg/clawd 的 fork，须长期可合并上游）

本项目是 nicepkg/clawd（clawd-on-desk）的 fork。所有 fork 自有扩展（Feishu 远程审批、Health
Reminder 等）必须按下列规范实现，确保**原作者更新上游后能干净合并**、且 fork 功能可整体并入而互不破坏：

1. **新增优先于修改**：fork 逻辑尽量放进专属新文件/目录（如 `src/remote-approval/`、`src/feishu-*.js`），
   不要改上游共享文件。
2. **上游文件改动最小且可定位**：确需改 `src/permission.js`、`src/main.js` 等上游文件时，只做最小接入
   （一处 `require` + 一处调用），实现下沉到 fork 模块；接入点集中并加注释标明 fork 来源，便于合并时辨认保留。
3. **保持上游文档/测试干净**：不改 `AGENTS.md` 等上游文档（fork 文档一律放 `docs/Expand_function/<feature>/`）；
   尽量让上游既有测试不改仍通过，fork 行为用 fork 自己的新测试覆盖。
4. **默认关闭、模块化、不改上游默认行为**：新功能默认 off 并经设置开关启用；不改变上游既有 agent/渠道的默认行为
   （示例：只放宽 Feishu，不动 Telegram）。
5. **差异下沉到 capability**：跨 provider/agent 的差异用能力标记表达（如 `requiresExplicitSummary`），
   不要在共享路径里写 provider 分支 if/else。

每个功能在 `docs/Expand_function/<feature>/` 留设计 / 阶段 / 实施日志。
