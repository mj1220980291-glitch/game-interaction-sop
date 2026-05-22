## 1. 准备与基线

- [x] 1.1 阅读 `@modelcontextprotocol/sdk@^1.0.4` 中 `server/index.d.ts` 与 `types.d.ts`，确认 `Server` 构造、`setRequestHandler(ListToolsRequestSchema, ...)`、`setRequestHandler(CallToolRequestSchema, ...)` 的具体签名与返回结构
- [x] 1.2 在 `packages/figma-mcp-server/src/server/createServer.ts` 顶部记录改造前 6 个 native 工具的清单（name、inputSchema、handler 行为概要），作为 regression 校验基线
- [x] 1.3 在仓库 `packages/figma-mcp-server/tests/` 下补一个 native 工具 smoke 测试（仅覆盖不依赖子进程的 `validate_dsl` / `dry_run_layout` / `validate_v2_markdown`），改造前先跑通确认现状基线

## 2. 重写 createServer 用 lower-level Server

- [x] 2.1 把 `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'` 替换为 `import { Server } from '@modelcontextprotocol/sdk/server/index.js'` 与 `import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'`
- [x] 2.2 设计 `NATIVE_TOOLS: Tool[]` 常量数组，每项含 `name`、`description`、`inputSchema` (raw JSON Schema 对象)，与原 `server.registerTool` 调用一一对应
- [x] 2.3 设计 `NATIVE_HANDLERS: Record<string, (args: unknown) => Promise<{ content: ..., isError?: boolean }>>`，把现有 6 个 `async ({ ... }) => jsonResult/errorResult(...)` 的逻辑搬过来；保持外部行为不变
- [x] 2.4 在 `createServer()` 里 `new Server({...}, { capabilities: { tools: {} } })`，注册 `ListToolsRequestSchema` handler 返回 `{ tools: NATIVE_TOOLS }`（proxy 部分下一节加），注册 `CallToolRequestSchema` handler 按 name 路由到 NATIVE_HANDLERS
- [x] 2.5 跑 1.3 的 smoke 测试，确保 3 个 native 工具行为零变化 → 这是中间里程碑

## 3. 集成 proxy 转发

- [x] 3.1 在 `CreateServerOptions` 加 `proxyClient?: Client` 与 `proxyTools?: Tool[]` 两个字段
- [x] 3.2 `createServer()` 启动时检测 native + proxy 工具名命中冲突；非空时写 stderr `[figma-interaction-doc-engine] tool name collision: <names>` 并 `process.exit(1)`
- [x] 3.3 ListToolsRequestSchema handler 改为返回 `{ tools: [...NATIVE_TOOLS, ...PROXY_TOOLS] }`
- [x] 3.4 CallToolRequestSchema handler 在 NATIVE_HANDLERS 命中失败后，检查 `PROXY_TOOLS_BY_NAME.has(name)`，命中则 `await proxyClient.callTool({ name, arguments })`，把整个返回值原样作为 result
- [x] 3.5 都不命中 → 返回 MCP 标准 "tool not found" 错误（参考 sdk 内置错误形态）

## 4. 入口 main() 与子进程时序

- [x] 4.1 在 `packages/figma-mcp-server/src/server/index.ts` 的 `if (FIGMA_BACKEND === 'figma-console')` 分支内，`await client.connect(transport)` 之后增加 `const list = await client.listTools(); const proxyTools = list.tools;`
- [x] 4.2 把 `proxyTools` 与 `client` 一并传给 `createServer({ v2Backend, proxyClient: client, proxyTools })`
- [x] 4.3 在 `client` 上 `transport.onclose` / `transport.onerror` 回调中写 stderr 并 `process.exit(1)`
- [x] 4.4 确认 `server.connect(stdioTransport)` 仅在 `proxyTools` 取回完成之后执行（即 host 看到 ready 时 proxy 已就绪）

## 5. 多实例检测警告

- [x] 5.1 在 `main()` 末尾、绑定 stdio transport 之前，扫描 `os.tmpdir()` 下匹配 `figma-console-mcp-*.json` 的端口广告文件
- [x] 5.2 解析每个文件的 `pid` 字段，过滤掉本进程 spawn 的 child PID（通过 `transport.spawn?.pid` 或 `client.transport` 暴露的 child process info 获取）
- [x] 5.3 若剩余条目非空，对每条写 stderr WARNING: `external figma-console-mcp detected (port=X, pid=Y, started=Z); remove standalone figma-console MCP server from CodeMaker configuration`

## 6. 测试与验证

- [x] 6.1 在 `packages/figma-mcp-server/tests/` 下加 unit test：mock 一个最小 `Client` 返回固定 `tools/list`，验证 createServer 后 host 视角 list = native + mock proxy
- [x] 6.2 unit test：验证 callTool 路由到 native handler 时不调 proxyClient；路由到 proxy 工具时调 proxyClient.callTool 一次且参数透传
- [x] 6.3 unit test：name 冲突时 createServer 应抛错或行为可被检测（视实现选择 process.exit 还是 throw）
- [x] 6.4 unit test：proxy 工具的 inputSchema 在 list 响应中字面相等于 mock 输入（无字段丢失、无 zod 转换）
- [x] 6.5 跑 `npx tsc -p packages/figma-mcp-server/tsconfig.json` 全量 typecheck pass
- [x] 6.6 `npm run build` 通过
- [ ] 6.7 端到端：CodeMaker 删除独立 figma-console 配置 → 重启 CodeMaker → 跑 `validate_v2_markdown`（不依赖 plugin，验证 native 路径） → 跑 `figma_get_status`（验证 proxy 路径） → 跑 `render_v2_markdown_to_figma`（验证 v2Backend 链路）

## 7. 文档与发布

- [x] 7.1 在 `packages/figma-mcp-server/README.md` 增加"配置迁移"章节：要求 CodeMaker 用户删除独立 figma-console MCP 配置项，仅保留 figma-interaction-doc-engine
- [x] 7.2 在仓库根 `README.md` 添加 BREAKING change 提示，链接 7.1
- [ ] 7.3 在 commit 信息里引用 OpenSpec change `proxy-figma-console-tools-from-engine`，方便未来 archive 时追溯

## 8. 环境清理脚本（可选附属）

- [x] 8.1 在 `scripts/cleanup-orphan-mcp.mjs` 写一个清理脚本：扫描 `figma-console-mcp` 进程，识别孤儿（不在当前 engine 进程链下），打印列表 + 提供 `--force` 选项一键 kill
- [x] 8.2 在 root `package.json` 添加 `npm run cleanup-mcp` script
