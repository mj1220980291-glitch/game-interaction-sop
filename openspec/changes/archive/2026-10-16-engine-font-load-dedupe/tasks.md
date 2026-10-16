## 1. 实现

- [x] 1.1 `figmaConsoleBackend.ts` `setMultipleTextContents`：改为两段式——先收集目标 TEXT 与去重字体集合并逐个 `loadFontAsync`，再统一写 `characters`；无效节点跳过

## 2. 测试

- [x] 2.1 新增单测：用假 MCP client 捕获 `setMultipleTextContents` 生成的脚本，在模拟 `figma` 全局下执行，断言同字体 N 个节点只调用 1 次 `loadFontAsync`、3 种字体调用 3 次、无效节点跳过
- [x] 2.2 `npm test --prefix packages/figma-mcp-server` 全部通过；`npm run build` 通过 tsc

## 3. 真机验证（需重启引擎 MCP）

- [x] 3.1 用户重启 figma-interaction-doc-engine MCP，确认进程启动时间晚于 dist 构建时间
- [x] 3.2 渲染《变色龙通用HUD规范》，确认不再超时，并核对原位多图结果（同时验证 `engine-inline-multi-figure`）
- [x] 3.3 `openspec validate engine-font-load-dedupe` 通过
