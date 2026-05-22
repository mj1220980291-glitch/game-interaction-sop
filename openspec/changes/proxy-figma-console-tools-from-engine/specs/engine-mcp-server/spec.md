## ADDED Requirements

### Requirement: Single MCP server for Figma operations

The `figma-interaction-doc-engine` MCP server SHALL be the sole MCP entry point for Figma operations. It MUST expose both its native v2-rendering tools and all tools provided by its internal child `figma-console-mcp` process to the upstream MCP host (e.g. CodeMaker), eliminating the need for a separately configured `figma-console` MCP server.

#### Scenario: CodeMaker only configures figma-interaction-doc-engine

- **WHEN** CodeMaker starts with only `figma-interaction-doc-engine` configured in its MCP server list
- **THEN** the host MUST see the union of native engine tools (`render_v2_markdown_to_figma`, `validate_v2_markdown`, `generate_interaction_doc`, `replay_from_checkpoint`, `validate_dsl`, `dry_run_layout`) AND every tool exposed by the child `figma-console-mcp` (`figma_execute`, `figma_capture_screenshot`, `figma_get_selection`, `figma_get_status`, etc.) in a single `tools/list` response

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

### Requirement: Detect and warn about extra figma-console-mcp instances

On startup, the engine SHALL inspect `/tmp/figma-console-mcp-{port}.json` advertisement files. If any advertised PID is not the engine's own child, the engine MUST emit a stderr WARNING listing those instances (port, PID, startedAt) so the user can clean them up. This warning MUST NOT block startup.

#### Scenario: Only the engine's own child is advertised

- **WHEN** all advertised port files reference the engine-spawned child PID
- **THEN** the engine starts silently with no warning

#### Scenario: External figma-console-mcp instance detected

- **WHEN** a port file references a PID that is not the engine's child
- **THEN** the engine writes `[figma-interaction-doc-engine] WARNING: external figma-console-mcp detected (port=X, pid=Y, started=Z); plugin connection may not reach the engine. Remove the standalone figma-console MCP server from your CodeMaker configuration.` to stderr
- **AND** continues startup so the user can still validate non-Figma tools

### Requirement: Backward compatibility removed for dual-MCP configuration

CodeMaker (and any other MCP host) MUST NOT be configured with both a standalone `figma-console` MCP server and `figma-interaction-doc-engine` simultaneously. This is a BREAKING change from the previous deployment model.

#### Scenario: Migration documented

- **WHEN** the user reads the engine README / release notes
- **THEN** the migration steps MUST instruct: (1) remove the standalone `figma-console` MCP entry from CodeMaker MCP settings, (2) ensure only `figma-interaction-doc-engine` remains, (3) restart CodeMaker so lazy-spawn rebuilds the process chain, (4) reload the Figma Desktop Bridge plugin
