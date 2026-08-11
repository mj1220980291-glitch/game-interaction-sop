# engine-mcp-server Specification

## Purpose
TBD - created by archiving change proxy-figma-console-tools-from-engine. Update Purpose after archive.
## Requirements

### Requirement: 引擎对外工具集

MCP Server `figma-interaction-doc-engine` SHALL 只暴露 v2 Markdown 管道所需的原生工具，外加从 figma-console-mcp 代理转发的全部工具。

原生工具集 SHALL 恰好为：

| 工具 | 是否需要 Figma 后端 | 用途 |
|---|---|---|
| `validate_v2_markdown` | 否 | 校验 v2 Markdown，返回 `ok/errors/warnings/ir` |
| `render_v2_markdown_to_figma` | 是 | 按 v2 Markdown 填充模板 1:14 |

已废弃的一代 YAML DSL 工具（`validate_dsl`、`dry_run_layout`、`generate_interaction_doc`、`replay_from_checkpoint`）SHALL NOT 出现在工具列表中。

#### Scenario: tools/list 只返回两个原生工具

- **WHEN** 客户端请求 `tools/list` 且未配置任何 proxyTools
- **THEN** 返回的工具名集合 SHALL 恰好为 `{validate_v2_markdown, render_v2_markdown_to_figma}`

#### Scenario: 调用已移除的一代工具返回未知工具错误

- **WHEN** 客户端调用 `tools/call` 且 `name` 为 `generate_interaction_doc`
- **THEN** 服务端 SHALL 返回未知工具错误，且 SHALL NOT 尝试转发给 proxyClient

#### Scenario: 代理工具与原生工具的命名冲突守卫仍生效

- **WHEN** proxyTools 中存在名为 `validate_v2_markdown` 的工具
- **THEN** 服务端 SHALL 在 stderr 输出含 `tool name collision` 与该工具名的诊断信息，并以退出码 1 终止进程

### Requirement: Single MCP server for Figma operations

The `figma-interaction-doc-engine` MCP server SHALL be the sole MCP entry point for Figma operations. It MUST expose both its native v2-rendering tools and all tools provided by its internal child `figma-console-mcp` process to the upstream MCP host (e.g. CodeMaker), eliminating the need for a separately configured `figma-console` MCP server.

#### Scenario: CodeMaker only configures figma-interaction-doc-engine

- **WHEN** CodeMaker starts with only `figma-interaction-doc-engine` configured in its MCP server list
- **THEN** the host MUST see the union of native engine tools (`render_v2_markdown_to_figma`, `validate_v2_markdown`) AND every tool exposed by the child `figma-console-mcp` (`figma_execute`, `figma_capture_screenshot`, `figma_get_selection`, `figma_get_status`, etc.) in a single `tools/list` response

#### Scenario: User invokes a proxied tool

- **WHEN** the host calls a proxied tool (e.g. `figma_capture_screenshot`) on the engine MCP server
- **THEN** the engine MUST forward the call verbatim to the child via MCP `tools/call`, return the child's response unchanged, and MUST NOT modify `name`, `arguments`, or the resulting `content` / `isError` fields

### Requirement: Native and proxied tools share the same dispatch

The engine SHALL register native tools and proxied tools through a single lower-level `Server.setRequestHandler(ListToolsRequestSchema, ...)` and `Server.setRequestHandler(CallToolRequestSchema, ...)` pair, and MUST NOT use `McpServer.registerTool` for any tool in this server.

#### Scenario: tools/list returns native and proxied tools together

- **WHEN** the host issues `tools/list`
- **THEN** the response MUST be the concatenation of `NATIVE_TOOLS` and `PROXY_TOOLS`, in any stable order, with proxied tools' `inputSchema` preserved as the raw JSON Schema returned by the child without any zod conversion

#### Scenario: tools/call routes by name

- **WHEN** the host issues `tools/call` with a `name`
- **THEN** the dispatcher MUST look up `name` first in `NATIVE_TOOLS_BY_NAME` and invoke that handler if found
- **AND** otherwise look up in `PROXY_TOOLS_BY_NAME` and forward via `client.callTool({ name, arguments })`
- **AND** otherwise return an MCP standard "tool not found" error

### Requirement: Tool name uniqueness across native and proxied sources

On startup, the engine MUST detect any name collision between `NATIVE_TOOLS` and the child's `tools/list` response. If at least one collision exists, the engine MUST refuse to bind its stdio transport, write a clear error message to stderr listing the colliding names, and `process.exit(1)`.

#### Scenario: No collision

- **WHEN** native tool names and child tool names are disjoint
- **THEN** the engine starts normally and `tools/list` returns the union

#### Scenario: Collision detected

- **WHEN** any native tool name equals a child-provided tool name
- **THEN** the engine writes `[figma-interaction-doc-engine] tool name collision: <name1>, <name2>, ...` to stderr and exits with code 1 before binding its server transport

### Requirement: Child process lifecycle is fail-fast

If the engine's stdio MCP client to the child `figma-console-mcp` enters a closed or errored state during runtime, the engine SHALL terminate its own process with exit code 1 rather than attempt to restart the child or continue serving requests.

#### Scenario: Child process exits unexpectedly

- **WHEN** the engine's `StdioClientTransport` to the child fires `onclose` or `onerror`
- **THEN** the engine logs the reason to stderr and calls `process.exit(1)` so the host (CodeMaker) can lazy-spawn a fresh engine on the next tool call

#### Scenario: Engine startup waits for child readiness

- **WHEN** `main()` is invoked with `FIGMA_BACKEND=figma-console`
- **THEN** the engine MUST complete `client.connect()` and `client.listTools()` BEFORE binding its own stdio server transport
- **AND** any host `tools/list` or `tools/call` request received after binding MUST see the proxied tool list already populated

### Requirement: 启动时回收被孤儿占用的 Bridge 端口

引擎 SHALL 在 spawn 自己的 `figma-console-mcp` 子进程**之前**，扫描
`<tmpdir>/figma-console-mcp-{port}.json` 广告文件，对其中仍存活的进程判定是否孤儿，
并终止孤儿及其子树、删除对应广告文件。

孤儿的判据 SHALL 是「直接父进程已不在进程表中」（POSIX 上另含 ppid 为 0/1）。父进程
仍存活的实例 SHALL 被保留——那是用户另行配置的第二个 figma-console MCP，杀掉它会破坏
别人的服务。

不在死亡时清理，是因为死亡时无法清理：Windows 上无窗口的控制台进程没有优雅终止通道
（实测 `taskkill` 不带 `/F` 被直接拒绝），MCP host 只能强杀引擎，而强杀不执行任何
`exit` / 信号钩子。子链 `npx → cmd.exe → local.js` 随 stdin 逐级 EOF 而死，唯独
`local.js` 不响应 EOF，于是活着、继续占用 9223、继续刷新广告文件；下一个引擎只能退到
9224，而 Figma 插件仍连在旧端口上——用户看到的现象是「重启后 Bridge 坏了」。

启动时回收不需要垂死进程的任何配合，因而同样能自愈崩溃、断电与 `kill -9`。
整个过程 SHALL 为 best-effort：广告文件不可读、进程表拿不到、kill 失败，均 SHALL
降级为「保持原样」并继续启动。

#### Scenario: 上一个引擎留下的孤儿占着首选端口

- **WHEN** 广告文件记录 pid=P 占用 9223，且 P 存活但其父进程已退出
- **THEN** 引擎 SHALL 终止 P 及其子树、删除该广告文件，并在 stderr 记录 `reclaimed Bridge port 9223 from orphaned figma-console-mcp pid=P`
- **AND** 随后 spawn 的子进程 SHALL 绑定到首选端口 9223

#### Scenario: 用户另配的实例不被误杀

- **WHEN** 广告文件记录的 pid 其父进程仍然存活
- **THEN** 引擎 SHALL NOT 终止它，只记录 `left figma-console-mcp pid=… running: has a live parent`

### Requirement: Detect and warn about extra figma-console-mcp instances

引擎 SHALL 在启动时检查 `<tmpdir>/figma-console-mcp-{port}.json` 广告文件，对任何
早于本引擎启动的实例发出 stderr WARNING（含 port / pid / startedAt 与清理命令）。
该警告 SHALL NOT 阻塞启动。

判定「是不是我们自己的子进程」SHALL NOT 使用 PID 比对：SDK spawn 的是 `cmd.exe`，
而写广告文件、绑定端口的是它下面两层的 `local.js`，两个 PID 永远不相等，用 PID 比对
会把引擎自己的子进程在每一次启动时都误报为外部实例。改用启动时刻比较——我们的子进程
必然晚于引擎启动。

#### Scenario: 只有引擎自己的子进程在广告

- **WHEN** 所有广告文件的 `startedAt` 都晚于引擎启动时刻
- **THEN** 引擎静默启动，不发警告

#### Scenario: 检测到早于引擎的实例

- **WHEN** 某广告文件的 `startedAt` 早于引擎启动时刻
- **THEN** 引擎 SHALL 输出含 port / pid / startedAt / 广告文件路径与 `taskkill /F /T /PID <pid>` 的 WARNING
- **AND** 继续启动

### Requirement: Backward compatibility removed for dual-MCP configuration

CodeMaker (and any other MCP host) MUST NOT be configured with both a standalone `figma-console` MCP server and `figma-interaction-doc-engine` simultaneously. This is a BREAKING change from the previous deployment model.

#### Scenario: Migration documented

- **WHEN** the user reads the engine README / release notes
- **THEN** the migration steps MUST instruct: (1) remove the standalone `figma-console` MCP entry from CodeMaker MCP settings, (2) ensure only `figma-interaction-doc-engine` remains, (3) restart CodeMaker so lazy-spawn rebuilds the process chain, (4) reload the Figma Desktop Bridge plugin

