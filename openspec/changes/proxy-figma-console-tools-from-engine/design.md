## Context

`figma-interaction-doc-engine` 当前架构：

```
CodeMaker (MCP 客户端宿主)
 ├─ stdio MCP → figma-console (用户独立配置)
 │                  └─ figma-console-mcp 子进程
 │                       └─ ws server :9225 ←─ Figma Bridge plugin ✅
 │
 └─ stdio MCP → figma-interaction-doc-engine
                  ├─ native tools: render_v2_*, validate_v2_*, generate_*, ...
                  └─ stdio MCP client → 又 spawn 一个 figma-console-mcp
                                        └─ ws server :9223 ←─ ❌ plugin 已被前者占
```

`figma-console-mcp` 包的设计：每个进程实例都尝试绑定自己的 ws 端口（9223-9232 范围），通过 `/tmp/figma-console-mcp-{port}.json` 写端口广告文件让 plugin 发现；**plugin 扫描这些文件，连接第一个响应的 server**。多 server 共存时，plugin 只连一个。

`figma-interaction-doc-engine` 的 v2Backend 实际只调用 `client.callTool({ name: 'figma_execute', ... })` 一个工具（见 `figmaConsoleBackend.ts`）。Native 暴露给 CodeMaker 的工具是 6 个：`validate_dsl`、`dry_run_layout`、`generate_interaction_doc`、`replay_from_checkpoint`、`validate_v2_markdown`、`render_v2_markdown_to_figma`。

实测痛点：

- 每次跑 SOP 都要人工 disable/enable MCP、重启 plugin、杀孤儿子进程
- 单机环境实测累积 30+ 个 figma-console-mcp 残留进程
- `render_v2_markdown_to_figma` 报 "Cannot connect to Figma Desktop" 是常态而非意外

仓库相关代码：

- `packages/figma-mcp-server/src/server/index.ts` — 入口，`spawn` 子进程并 `client.connect`
- `packages/figma-mcp-server/src/server/createServer.ts` — 注册 6 个 native 工具
- `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts` — v2Backend 实现，仅用 `figma_execute`

## Goals / Non-Goals

**Goals:**

- 单机环境**永远只有一个** `figma-console-mcp` 进程绑 ws 端口（即引擎内部 spawn 的子进程），从此根除端口竞争
- CodeMaker 的 MCP 配置中**只需一条** `figma-interaction-doc-engine`，它对外同时暴露：
  - 引擎自身 6 个 native 工具
  - 子进程 figma-console-mcp 提供的全部工具（透明 forward）
- proxy 转发对 LLM / 用户透明：工具名、inputSchema、调用语义、错误格式与直接调子进程一致
- 不依赖 zod 重写每个 figma-console 工具的 schema —— 用 lower-level Server API 透传 child 的 raw JSON Schema
- 与现有 6 个 native 工具的功能、行为零回归

**Non-Goals:**

- 不实现 child 子进程意外退出后的自动重启（引擎跟随退出，依赖 CodeMaker lazy spawn 重建进程链）
- 不为 proxy 工具做语义改造（参数转换、结果再封装）
- 不做 figma-console-mcp 包的 fork 或 patch
- 不向后兼容旧"双 MCP 配置"模式 —— BREAKING：CodeMaker 必须删除独立 figma-console MCP 配置项
- 不实现 Web/HTTP transport，沿用 stdio
- 不引入新 npm 依赖

## Decisions

### 1. 用 lower-level `Server` 取代 `McpServer`

`@modelcontextprotocol/sdk` 提供两层 API：

- `McpServer.registerTool(name, { inputSchema: ZodRawShape | ZodType }, handler)` — 高层，强制 zod
- `Server.setRequestHandler(ListToolsRequestSchema, handler)` + `Server.setRequestHandler(CallToolRequestSchema, handler)` — 低层，原生 JSON-RPC，inputSchema 是 raw JSON Schema 字段

**选 lower-level Server**，原因：

- proxy 工具来自子进程，schema 是 JSON Schema。`McpServer` 要求 zod，强行转换需要 `json-schema-to-zod` 或手写转换器，前者引入新依赖，后者覆盖不全（figma-console 工具用了 anyOf/format/conditional）
- figma-console 工具数量约 50+，每个都用 `z.passthrough()` 占位会让 LLM 看不到 schema → 工具不可用
- lower-level Server 一处 dispatch 同时处理 native + proxy，逻辑统一

**Alternatives considered:**

| 方案 | 否决理由 |
|---|---|
| `McpServer` + 手写每个 figma-console 工具的 zod | 50+ 工具人工维护，子进程升级会失同步 |
| `McpServer` + `z.object({}).passthrough()` 占位 | LLM 调用时看不到具体参数 schema，工具变废柴 |
| `McpServer` + `json-schema-to-zod` 包 | 引入新依赖；该包对 anyOf/format/oneOf 等支持不完整 |
| 自己实现 JSON Schema → zod 转换器 | 工作量大，遗漏复杂 schema 的概率高 |
| Hack `mcpServer.server.setRequestHandler(...)` 覆盖 McpServer 自身的 handler | 既然要绕开 McpServer，索性整个不用 |

### 2. 子进程工具发现：启动时 `client.listTools()` 一次性

引擎启动时 `client.connect()` 完成后，立即 `await client.listTools()` 拿到子进程工具列表。把 `tools[]`（每项含 `name`、`description`、`inputSchema` 为 JSON Schema）当作不可变 `proxyTools` 传给 `createServer({ proxyClient, proxyTools })`。

**Alternatives considered:**

| 方案 | 否决理由 |
|---|---|
| 每次 `tools/list` 都现拉 | 增加每次 list 的延迟；且子进程启动后工具集稳定，无必要 |
| 监听 child 的 tool list change notification | 复杂，子进程不发此通知 |

### 3. dispatch 路由策略

```
[CallToolRequest]
       │
       ▼
  name 在 NATIVE_TOOLS?
       ├─ 是 ──▶ 调 native handler（现有 6 个的逻辑）
       │
       └─ 否 ──▶ name 在 PROXY_TOOLS_BY_NAME?
                       ├─ 是 ──▶ client.callTool({ name, arguments }) → 子进程
                       │              透明返回 { content, isError } 给上层
                       │
                       └─ 否 ──▶ 抛 MCP "Tool not found" 错
```

**命名冲突**：启动时检测 `NATIVE_TOOL_NAMES ∩ PROXY_TOOL_NAMES`，非空 → 立即抛错并退出。当前 native 工具名以 `validate_*` / `render_*` / `generate_*` / `dry_run_*` / `replay_*` 为前缀，子进程工具以 `figma_*` 为前缀，不会冲突，但要防御未来加新工具。

### 4. 错误传播

子进程 `client.callTool(...)` 返回 MCP 标准结果 `{ content: [...], isError?: boolean }`。引擎层透明 return 这个结果，不再包一层。异常情况：

- 子进程协议级异常（transport 断开、JSON-RPC 错误）：作为 `isError: true` 的结果返回上层
- 子进程超时：尊重 sdk 默认超时；不重试
- 子进程进程崩溃：见决策 5

### 5. 子进程生命周期

`StdioClientTransport` 的子进程退出 → `client` 失去连接 → 引擎进程内部 v2Backend 与 proxy 工具调用一律失败。处理策略：

- 监听 transport `onclose` / `onerror`，引擎主进程主动 `process.exit(1)`
- 由 CodeMaker 的 lazy spawn 机制重新拉起整个 engine 进程（同时它会重新 spawn 子进程）

**不实现 child auto-restart**，原因：

- 重启后子进程 PID 变，工具列表理论上一致但仍要重新 `listTools()`，需要把这个改动通知 CodeMaker（MCP 协议有 list-changed 通知，但稳定性需要测）
- 子进程崩溃通常是 plugin 端协议错误或本机资源问题，重启后短期内大概率再崩
- 让上层 `process.exit(1)` 后由 CodeMaker 重启更干净

### 6. spawn 时序与 ready 状态

```
main() {
  1. spawn child via StdioClientTransport
  2. await client.connect           ← 子进程 stdio 通了
  3. await client.listTools()       ← 拿到 proxyTools
  4. v2Backend = buildFigmaConsoleBackend(client)
  5. server = createServer({ v2Backend, proxyClient: client, proxyTools })
  6. server.connect(stdioTransport) ← 才让 CodeMaker 看到引擎 ready
}
```

CodeMaker 看到引擎 MCP server ready 时，proxy 工具列表已确定 + 转发链路已就绪，不存在"工具列表已经返回但 child 还没好"的窗口。

### 7. CodeMaker 配置迁移

引擎不能感知或自动修改 CodeMaker 的配置文件。**显式要求用户手动删除独立 figma-console MCP server 配置**，作为 README / 发布说明的迁移条目。

引擎运行时检测 `/tmp/figma-console-mcp-{port}.json` 端口广告文件中的 PID 是否仅有自己 spawn 的子进程，若发现额外实例 → 启动时打印 stderr 警告（不阻断启动）。

## Risks / Trade-offs

- [**用户没删独立 figma-console MCP 配置**] → mitigation:
  - 启动时检测 `/tmp` 端口广告文件，发现额外 figma-console-mcp 实例 → 在 stderr 打 WARNING 提示用户手动清理
  - 发布说明 + README 显式迁移指引
  - 不阻断启动，避免误伤其它合理多实例场景

- [**lower-level `Server` API 用法不熟，引入 native 工具回归**] → mitigation:
  - 实施前先阅读 `@modelcontextprotocol/sdk@^1.0.4` 的 `server/index.d.ts` 与 `types.d.ts` 中 `ListToolsRequestSchema` / `CallToolRequestSchema` 定义
  - 6 个 native 工具中至少 2 个不依赖子进程（`validate_dsl`、`dry_run_layout`、`validate_v2_markdown`），实施完先跑这几个 smoke test 验证 lower-level dispatch 工作正常
  - 全套实施完前不删独立 figma-console MCP，保留逃生通道

- [**proxy 工具的 JSON Schema 在 CodeMaker UI / LLM 中显示异常**] → mitigation:
  - schema 来自子进程的 `tools/list` 响应，与用户当前直接配子进程时拿到的 schema 完全相同；CodeMaker 既然能消费独立 figma-console，也必然能消费本 proxy
  - 风险点是引擎透传时 schema 字段被误改 / 丢字段；通过 unit test：mock 一个 child tool 列表 → engine list 返回 → 字段对比

- [**子进程意外退出导致引擎跟着退出，影响其它 native 工具调用**] → mitigation:
  - native 工具中只有 `generate_interaction_doc` / `replay_from_checkpoint` / `render_v2_markdown_to_figma` 真正需要 child；其余 3 个不依赖
  - 子进程未启动 / 已退出时，依赖 child 的 native 工具返回明确的 `EXECUTOR_BACKEND_UNAVAILABLE` / `V2_BACKEND_UNAVAILABLE` 错误（现状已如此）
  - 退出策略采用 fail-fast 是为了让 CodeMaker lazy spawn 重建，权衡是当 user 在跑非 child 工具时也会被中断；但实际很少发生

- [**工作量超 2 小时预算**] → mitigation:
  - 范围严格 boxed 在 `createServer.ts` + `index.ts` 两个文件
  - 首小时若发现 lower-level Server 写法需要更多 sdk 内部知识，立即停下评估是否需要 spike
  - 把改造分 2 个 commit：先重写 native 工具到 lower-level Server（保持外部行为不变）+ 跑 smoke 验证；再加 proxy 转发

- [**openspec spec 与代码不同步**] → mitigation:
  - 通过本 change 的 specs/engine-mcp-server/spec.md 显式登记 contract，archive 后进 openspec/specs/
  - PR commit message 引用本 change，让未来读者顺藤摸瓜

## Migration Plan

1. **代码改造**（按本 change 的 tasks.md 执行）
2. **本机自测**（实施者执行）
   - typecheck pass
   - 运行 `validate_dsl` / `dry_run_layout` / `validate_v2_markdown` 三个 native 工具，结果与改造前一致
   - 运行 `render_v2_markdown_to_figma` 一次（需要 plugin 联调）
3. **CodeMaker 配置迁移**（用户执行，文档指引）
   - 在 CodeMaker MCP 设置里 **删除独立 figma-console MCP server 配置项**
   - 仅保留 `figma-interaction-doc-engine`
   - 重启 CodeMaker 触发 lazy spawn
4. **环境清理**（一次性）
   - 杀掉所有历史 `figma-console-mcp` 孤儿进程（仓库 `scripts/cleanup-orphan-mcp.mjs` 可单独提供）
5. **验证**
   - `figma_get_status` 通过 proxy 调用，返回 `port: 9223`、`portFallbackUsed: false`
   - `figma_capture_screenshot` 通过 proxy 正常出图
   - `render_v2_markdown_to_figma` 跑 SOP 测试用 markdown，输出 Figma 文档正常

**Rollback**：

- 若 lower-level Server 改造引入回归且短期内无法修复 → 回滚到改造前的 commit；用户在 CodeMaker 重新加回独立 figma-console MCP 配置
- 因为是 BREAKING 变更，rollback 也意味着用户配置回滚，需在 PR description 里说明 commit 哈希

## Open Questions

- 引擎启动时检测"额外 figma-console-mcp 实例"是否值得做？如果实施成本低（读 `/tmp/*.json` + PID 比对，<30 行）则做；否则可先观察用户实际遇到的错误信息是否足以引导排查
- 是否要在 native 工具列表里加一个 `engine_status` 调试工具，返回当前 child PID、ws 端口、工具数等运行时元数据？利于排查但属新增功能，本 change 范围内可不做
