## Why

真机现场（2026-11-04，变色龙项目，engine 0.4.2）：`render_v2_markdown_to_figma` 每次都失败，报 `V2_RENDER_RUNTIME_ERROR / Cannot connect to Figma Desktop`，且 `enginePid` 每次调用都变（49956→27364→10580→37856→49220→33236→30128）。

日志给出的是另一回事（`codemaker-language-server/logs/20261104/180217-…-14536-0.log`）：

| 时刻 | 事件 |
|---|---|
| 20:44:12.928 | `Calling MCP tool: render_v2_markdown_to_figma` |
| 20:45:12.940 | `self-heal triggered … MCP error -32001: Request timed out` → `Restarting MCP server (old pid=32288)` |
| 20:45:16.817 | 新进程 `connected`（= 新 `enginePid`） |
| 20:45:16.837 | 自愈重试 → `ok:false / Cannot connect`（距 connected 仅 0.07s） |

同样的 **60.000s** 精确复现三次（20:45:35→20:46:35、20:48:50→20:49:50），另一次是重启后立即 `Not connected`。结论：

- `enginePid` 每次变 = **宿主到 60s 判定请求超时后重启了整个 MCP 服务**，不是 worker swap（swap 只发生在 boot 与 dist 变更）
- 触发超时的是插件侧 **socket 还在、sandbox 已假死**：`figma_execute` 发出去没有回程，引擎不返回；`figma-console-mcp` 自己注释写明「a TCP-open socket is not proof of health」
- 引擎当前对这种情况没有任何快速判据：`render.ts:501` 的探活默认关闭，`figmaConsoleBackend.ts` 的 `client.callTool` 没有客户端侧超时，`describeBridgeFailure`（`bridgeState.ts:69`）在「端口对、插件无回程」时直接 `return undefined`，一句诊断都不给
- 结果：一次假死 → 60s 干等 → 宿主杀进程 → 桥重绑 → 插件来不及重连 → 下一次 render 立刻 `Cannot connect`，循环自锁

## What Changes

- **探活默认开启**：`render_v2_markdown_to_figma` 在绑定目标文件之后、第一笔写操作之前 SHALL 做一次插件回环探活（`return 1;` 5s 超时），失败按现有 5×3s 重试吸收抖动；仍失败返回 `V2_BRIDGE_DOWN`。开关改为「默认开、`GISOP_PREFLIGHT=0` 显式关」
- **每次 exec 加客户端侧超时**：`figma_execute` 调用 SHALL 被客户端 race 掉（`插件 timeout + 5s`，`GISOP_EXEC_TIMEOUT_MS` 可覆盖），超时返回 `V2_BRIDGE_NO_REPLY`（message 含 worker/supervisor pid、端口、建议「重开插件」），SHALL NOT 让调用挂到宿主 60s 自愈阈值
- **诊断补第三态**：`describeBridgeFailure` 除「退到非首选端口」「首选端口被占」外，新增「端口在首选位、无 holder、插件无回程」分支，输出端口 / worker pid / supervisor pid / 判定依据
- **渲染返回体带 `bridge` 快照**：`{ port, preferredPort, fallback, holderPid, pluginConnected, lastRoundtripMs, enginePid, supervisorPid }`，让回执方一眼区分「端口问题 / 插件假死 / 模板问题 / md 问题」
- **worker 起来后的重连窗口**：worker 完成 boot 后先做一次回环探活，失败则最多等 20s（worker swap 后插件重连的实测时长），SHALL NOT 让第一笔业务写操作去撞超时

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `bridge-port-stability`: 新增「活链判定 = 插件回环往返」「客户端侧 exec 超时」「诊断第三态」
- `template-render`: 新增「开写前探活（默认开）」「`V2_BRIDGE_NO_REPLY` 错误码」「返回体 `bridge` 快照」

## Impact

- `packages/figma-mcp-server/src/v2/render.ts`：探活门控翻转（`:496-528`）、`V2_BRIDGE_DOWN` / `V2_BRIDGE_NO_REPLY` 分流、`engineFields` 增加 `bridge`
- `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts`：`exec()` 增加客户端侧 race 超时（`:78-87`）
- `packages/figma-mcp-server/src/server/bridgeState.ts`：`describeBridgeFailure` 第三态（`:66-78`）；`lastRoundtripMs` / `pluginConnected` 进状态
- `packages/figma-mcp-server/src/server/worker.ts`：boot 后回环探活 + 20s 重连窗口（`:290` 之后）
- `packages/figma-mcp-server/src/v2/ir.ts`：新增错误码 `V2_BRIDGE_NO_REPLY`
- 测试：`tests/server-bridge-state.spec.ts`、`tests/v2/render-preflight.spec.ts`（新增）、`tests/server-exec-timeout.spec.ts`（新增）
- 文档：`docs/INSTALL.md` 补「宿主 60s self-heal 会重启 MCP → enginePid 变」判据；`SETUP.md` 的 MCP 配置表加 `GISOP_PREFLIGHT`
- 无破坏性变更：默认行为从「干等 60s」变成「≤20s 给可判定错误」，成功路径不变
