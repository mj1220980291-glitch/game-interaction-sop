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

### Requirement: 批量文本写入按字体去重加载

`setMultipleTextContents` 在单次 `figma_execute` 内 SHALL 对所有目标 TEXT 的字体按 `family + style` 去重，每种字体 SHALL 只调用一次 `figma.loadFontAsync`，全部加载完成后再写入 `characters`。节点不存在或非 TEXT 的条目 SHALL 静默跳过（与原行为一致）。

理由：Figma 对短时间内连续的 `loadFontAsync` 调用节流（实测第 7 次起每次约 1000ms），逐节点加载会使数十条文本的批量写入超过插件 30s 单次执行上限。

#### Scenario: 同字体大批量写入不超时

- **WHEN** 一次 `setMultipleTextContents` 写入 47 个均为同一字体的 TEXT
- **THEN** 插件端 SHALL 只调用 1 次 `loadFontAsync`，该次执行 SHALL 在 30s 上限内完成

#### Scenario: 混合字体

- **WHEN** 批量中的 TEXT 共涉及 3 种不同字体（含单个 TEXT 内的混合字体）
- **THEN** 插件端 SHALL 恰好调用 3 次 `loadFontAsync`，再写入全部 `characters`

#### Scenario: 无效节点跳过

- **WHEN** 批量中某个 `nodeId` 不存在或不是 TEXT
- **THEN** 该条 SHALL 被跳过，其余条目正常写入，不抛错

### Requirement: render 工具 assetMap 支持配图键与裁剪区域

`render_v2_markdown_to_figma` 的 `assetMap` 输入 schema SHALL 接受两类键：

- 章节键 `"NN"`：值为 `image` / `figma_node` / `skip`（含义不变）
- 配图键 `"NN/C/K"`：值为 `figma_node` / `skip`

`figma_node` 值 SHALL 支持可选字段 `crop: { x: number, y: number, width: number (>0), height: number (>0) }` 与 `scale: number (>0)`。工具描述 SHALL 写明配图键格式、K 的计数规则（簇内文档顺序、跨 `####` 连续）与 `crop` 坐标系（相对源节点左上角）。

源节点 SHALL 位于渲染目标文件内；工具描述 SHALL 注明这一约束。

#### Scenario: 配图键 schema 校验通过

- **WHEN** 客户端传入 `assetMap = { "01": { type: "skip" }, "01/2/1": { type: "figma_node", fileKey: "f", nodeId: "1:2", crop: { x: 10, y: 20, width: 300, height: 200 } } }`
- **THEN** 服务端 SHALL 接受该输入并把配图键原样传给渲染器

#### Scenario: crop 尺寸非法

- **WHEN** `crop.width` 为 0 或负数
- **THEN** 服务端 SHALL 以 schema 校验错误拒绝该调用

### Requirement: render 工具支持同步模式参数

`render_v2_markdown_to_figma` 的输入 schema SHALL 新增：

- `target.rootId: string`：已渲染文档的 root 节点 ID，传入即进入同步模式
- `scope: string`：须匹配 `^\d{2}(\/\d+)?$`
- `dryRun: boolean`

没有 `target.rootId` 时如果传了 `scope` 或 `dryRun`，服务端 SHALL 返回 `INVALID_INPUT`，并且 SHALL NOT 调用渲染器。

输出 SHALL 新增 `mode: 'create' | 'reconcile'`。同步模式下 SHALL 额外返回 `changes`、`conflicts`、`preserved` 三个数组。

工具描述 SHALL 写明：重新渲染已有文档时应传 `rootId`；冲突不会被自动覆盖；`dryRun` 可用于预览。

原生工具集 SHALL 仍恰好为 `{validate_v2_markdown, render_v2_markdown_to_figma}`。

#### Scenario: 无 rootId 时传 scope
- **WHEN** 客户端传 `{ markdown, scope: "03" }`，没有 `target.rootId`
- **THEN** 服务端 SHALL 返回 `INVALID_INPUT`

#### Scenario: scope 格式非法
- **WHEN** 客户端传 `scope: "3"`
- **THEN** 服务端 SHALL 返回 `INVALID_INPUT`

#### Scenario: 同步模式返回冲突清单
- **WHEN** 客户端带 `target.rootId` 调用，且存在双方都改过的条目
- **THEN** 返回值 SHALL 含 `mode:'reconcile'` 和非空的 `conflicts`

### Requirement: 只读模板探针工具

引擎 MCP server SHALL 提供工具 `figma_probe_template`，用于在渲染前体检一个项目模板。

工具 SHALL 接受 `nodeId`（必填）与 `fileKey`（可选，缺省当前连接文件），SHALL 返回上节定义的探针结果结构。

工具 SHALL 被归类为只读工具：SHALL NOT 写入画布，SHALL NOT 要求任何确认提示。

#### Scenario: 工具注册
- **WHEN** MCP server 启动
- **THEN** 工具列表中 SHALL 出现 `figma_probe_template`，且其描述明确写出「只读，不修改文件」

#### Scenario: 缺参数
- **WHEN** 调用时未提供 `nodeId`
- **THEN** 工具 SHALL 返回参数错误，SHALL NOT 退化为扫描当前页

### Requirement: 探针结果可直接落盘

`figma_probe_template` 返回的 `draft` SHALL 是合法 `template.json` 的内容（`components` 为 `null` 占位），调用方 SHALL 能原样写入 `<项目根>/.interaction-sop/template.json` 而不需改写结构。

#### Scenario: 草案可解析
- **WHEN** 把 `draft` 原样写入 `template.json` 后再由引擎解析
- **THEN** 解析 SHALL 成功，能力项与探针输出逐字段一致

### Requirement: 模板编译工具

引擎 MCP server SHALL 提供写入类工具 `figma_compile_template`，用于把项目模板编译成库文件里的 4 个原子组件并回填组件 key。

工具 SHALL 接受：`phase`（`compile` | `verify`，必填）、`source`（`{ fileKey?, nodeId }`，必填）、`library`（`{ fileKey, pageId? }`，必填）、`project`（必填）、`samples`（可选，0~3 个节点 id）、`parts`（可选，缺省四个部件全量）、`write`（可选，缺省 `false`）。

#### Scenario: 工具注册
- **WHEN** MCP server 启动
- **THEN** 工具列表中 SHALL 出现 `figma_compile_template`，且描述明确写出「会写入库文件，需 `write: true`」

#### Scenario: 缺必填参数
- **WHEN** 调用时未提供 `library.fileKey` 或 `source.nodeId`
- **THEN** 工具 SHALL 返回参数错误，SHALL NOT 退化为使用当前打开文件

#### Scenario: write 缺省为干跑
- **WHEN** 调用时未提供 `write`
- **THEN** 工具 SHALL 按干跑执行，SHALL NOT 写入任何节点

### Requirement: 写入前确认与撤销点

工具在 `write: true` 且 `phase: compile` 时 SHALL 先创建撤销检查点，再开始写入。

工具 SHALL NOT 在未获显式 `write: true` 的情况下写入库文件。

#### Scenario: 写入前有撤销点
- **WHEN** 以 `write: true` 执行 `compile`
- **THEN** 写入序列开始前 SHALL 已创建一次撤销检查点

### Requirement: verify 阶段只读库文件

`phase: verify` SHALL 只读库文件中的组件 key，SHALL NOT 修改任何画布节点。

`verify` 的输出 SHALL 用于回填 `<项目根>/.interaction-sop/template.json`。

#### Scenario: verify 不改画布
- **WHEN** 执行 `phase: verify`
- **THEN** 库文件的节点树 SHALL 与执行前一致

### Requirement: 编译工具的契约生成阶段

`figma_compile_template` SHALL 接受 `phase: "compile" | "verify" | "contract"`。

`phase = "contract"` SHALL 只读已登记模板包，返回 `md-contract.md` 正文与建议路径，SHALL NOT 连接 Figma、SHALL NOT 写入任何节点或配置文件。

`phase = "verify"` 的报告 SHALL 除组件 key 外同时返回 `mdContract: { path, content }`。

#### Scenario: 只读生成契约
- **WHEN** 以 `phase = "contract"` 调用且项目已登记模板包
- **THEN** 返回结果 SHALL 含契约正文，且后端 SHALL 记录到零次调用

#### Scenario: 未登记项目
- **WHEN** 以 `phase = "contract"` 调用但该项目没有模板包
- **THEN** 工具 SHALL 返回明确错误并提示先编译，SHALL NOT 编造模板能力

