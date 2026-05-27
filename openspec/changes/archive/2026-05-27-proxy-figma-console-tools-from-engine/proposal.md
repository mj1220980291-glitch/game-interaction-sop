## Why

`figma-interaction-doc-engine` 启动时会通过 `npx` spawn 一个 `figma-console-mcp` 子进程作为 v2Backend，子进程绑定独立 ws server 端口（9223 或 fallback）。但 CodeMaker 通常还独立配置了 `figma-console` MCP server，它也 spawn 自己的 `figma-console-mcp` 实例（端口 9225 等）。

Figma Desktop Bridge plugin 设计上**只能连一个** ws server。结果是两个 figma-console-mcp 实例抢同一个 plugin：先启动的拿到 plugin，后启动的永远连不上。`figma-interaction-doc-engine` 的 v2Backend 调用 `figma_execute` 时随机性地报 "Cannot connect to Figma Desktop"，需要人工杀进程、disable/enable MCP、重启 plugin 才能临时打通，每次跑 SOP 都要折腾一遍，且环境会积累一堆 figma-console-mcp 孤儿进程（实测过单机 30+ 个残留）。

## What Changes

- **BREAKING**: `figma-interaction-doc-engine` 不再要求 CodeMaker 独立配置 `figma-console` MCP server。CodeMaker 配置中应**删除独立 figma-console MCP server**，只保留 `figma-interaction-doc-engine`
- 引擎在启动时（当 `FIGMA_BACKEND=figma-console`）spawn 子进程后，调用 `client.listTools()` 获取子进程暴露的所有 figma-console 工具
- 引擎将所有这些 figma-console 工具通过 MCP 协议**proxy/forward** 给上层 CodeMaker，上层调用时透明转发到子进程
- 引擎自身的 native 工具（`render_v2_markdown_to_figma`、`validate_v2_markdown`、`generate_interaction_doc`、`replay_from_checkpoint`、`validate_dsl`、`dry_run_layout`）保留不变，与 proxy 工具共存于同一 server
- proxy 工具的 inputSchema 直接透传子进程返回的 JSON Schema，不做 zod 重写——为此需将工具注册路径从 `McpServer.registerTool`（要求 zod shape）下沉到 lower-level `Server.setRequestHandler(ListToolsRequestSchema/CallToolRequestSchema)`
- 子进程崩溃时引擎本身也退出，由 CodeMaker 的 lazy spawn 机制重启整个进程链；不实现 child auto-restart
- 工具命名冲突检测：proxy 工具与 native 工具同名时启动报错，避免运行时混乱

## Capabilities

### New Capabilities

- `engine-mcp-server`: figma-interaction-doc-engine 这个 MCP server 对外暴露工具的契约。包括 native 工具集合、proxy 工具来源（child figma-console-mcp）、proxy 转发语义、子进程生命周期与冲突检测规则

### Modified Capabilities

无。`figma-template-1-14-rendering` 与 `markdown-v2-contract` 不变。

## Impact

- **代码**：`packages/figma-mcp-server/src/server/createServer.ts` 重写工具注册（从 McpServer 下沉到 Server lower-level）；`packages/figma-mcp-server/src/server/index.ts` 增加 `client.listTools()` 与 `proxyTools` 传入 createServer
- **依赖**：无新增 npm 依赖；继续用 `@modelcontextprotocol/sdk@^1.0.4` 已有的 `Server`、`ListToolsRequestSchema`、`CallToolRequestSchema` 等
- **CodeMaker 用户配置**：使用方需删除独立的 `figma-console` MCP server 配置项，仅保留 `figma-interaction-doc-engine` 一条；这是发布时的迁移指引，非自动化
- **运行时端口**：从此环境只一个 figma-console-mcp 实例（引擎内部 spawn 的），plugin 永远连同一端口 9223，端口竞争问题彻底消失
- **dist 体积**：proxy 逻辑约 100-150 行新代码；createServer 重写后总行数预计与现状持平或略增
- **测试**：现有 6 个 native 工具的 smoke test 路径需要重跑确认无 regression；proxy 工具的端到端验证依赖 CodeMaker + plugin 联调
