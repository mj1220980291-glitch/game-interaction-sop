## 1. 后端口径

- [ ] 1.1 `bridgeState` 增加 `pluginConnected?: boolean` 与 `lastRoundtripMs?: number`，由探活结果写入
- [ ] 1.2 `describeBridgeFailure` 增加第三态：`port === preferredPort && !fallback && holderPid === undefined` → 输出「桥在 <port> 但没有插件回环」+ worker/supervisor pid + 重开插件指引（`bridgeState.ts:66-78`）
- [ ] 1.3 `pluginConnected === false` 时 message 走「插件未连接，请在目标文件打开插件」，与「sandbox 假死」分开
- [ ] 1.4 单测：三态各一条 + `pluginConnected=false` 一条（`tests/server-bridge-state.spec.ts`）

## 2. 客户端侧 exec 超时

- [ ] 2.1 `figmaConsoleBackend.exec()` 外面套 race：budget 默认 `timeout + 5000`，`GISOP_EXEC_TIMEOUT_MS` 可覆盖
- [ ] 2.2 超时抛带 `code: 'V2_BRIDGE_NO_REPLY'` 的错误，message 含 `port / workerPid / supervisorPid / budget`
- [ ] 2.3 `callTool` 的 promise 超时后不再等待（避免残留未处理 rejection）：race 里挂 `catch(() => {})`
- [ ] 2.4 单测：child 不回复 → 20s 内抛 `V2_BRIDGE_NO_REPLY`（用假 client + 假时钟，`tests/server-exec-timeout.spec.ts`）

## 3. 渲染入口探活

- [ ] 3.1 `render.ts:501` 门控翻转为默认开：`process.env.GISOP_PREFLIGHT !== '0'`
- [ ] 3.2 探活失败仍走 `retryTransient` 5×3s；最终失败返回 `V2_BRIDGE_DOWN`（沿用现有 message，补 `bridge` 快照）
- [ ] 3.3 探活通过后写 `pluginConnected: true` + `lastRoundtripMs` 进 `bridgeState`
- [ ] 3.4 `render.ts` 的 `engineFields` 增加 `bridge` 快照（`port / preferredPort / fallback / holderPid / pluginConnected / lastRoundtripMs / enginePid / supervisorPid`）
- [ ] 3.5 单测：探活失败不进入写路径（不调 `commitUndoCheckpoint`）；`bridge` 字段齐全（`tests/v2/render-preflight.spec.ts`）

## 4. worker 重连窗口

- [ ] 4.1 worker 在 `v2Backend` 装配后做一次探活；失败按 2s 间隔最多等 20s
- [ ] 4.2 窗口耗尽仍失败：记录 stderr 一行判定，但 SHALL NOT 让 worker 退出（业务调用照常报 `V2_BRIDGE_DOWN`）
- [ ] 4.3 单测：探活首次失败、第三次成功 → boot 继续；全程失败 → boot 继续但状态为 `pluginConnected=false`

## 5. 错误码与文档

- [ ] 5.1 `v2/ir.ts` 增加 `V2_BRIDGE_NO_REPLY`；`createServer.ts` 的工具描述补一句「超时 ≤20s，带 bridge 快照」
- [ ] 5.2 `docs/INSTALL.md` 补「宿主 60s self-heal 会重启 MCP → `enginePid` 每调都变」的判据与日志路径（与 2026-11-04 那条排障并列）
- [ ] 5.3 `SETUP.md` MCP 配置表加 `GISOP_PREFLIGHT`（默认开）与 `GISOP_EXEC_TIMEOUT_MS`（默认 20000）
- [ ] 5.4 `packages/skill/phases/phase4-figma.md` 排查顺序加「`V2_BRIDGE_NO_REPLY` = 插件 sandbox 假死，关掉重开插件，别改 md」

## 6. 回归

- [ ] 6.1 `npx tsc -p tsconfig.json` 通过
- [ ] 6.2 `npx vitest run --no-file-parallelism` 全绿（含审计口径不受影响）
- [ ] 6.3 真机：在插件已假死的机器上复现一次，确认 20s 内拿到 `V2_BRIDGE_NO_REPLY`，宿主 **不再**重启 MCP（日志里无 `self-heal triggered`）
- [ ] 6.4 真机：正常环境下渲染耗时增量 ≤1 次往返；`bridge` 快照字段与实际端口一致
- [ ] 6.5 版本号三处一致（`package.json` / `src/v2/version.ts` / `packages/skill/manifest.json`）+ `CHANGELOG.md` + `openspec/HANDOFF.md`
