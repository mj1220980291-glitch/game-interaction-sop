## 1. 后端口径

- [x] 1.1 `bridgeState` 增加 `pluginConnected?: boolean` 与 `lastRoundtripMs?: number`，由探活结果写入
- [x] 1.2 `describeBridgeFailure` 增加第三态：`port === preferredPort && !fallback && holderPid === undefined` → 输出「桥在 <port> 但没有插件回话」+ worker/supervisor pid + 重开插件指引（`bridgeState.ts`）
- [x] 1.3 `pluginConnected === false` 时 message 走「插件没接入」，`V2_BRIDGE_NO_REPLY` 走「sandbox 假死」（`describeNoReply`），两者分开
- [x] 1.4 单测：三态各一条 + `pluginConnected=false` 一条（`tests/server/bridge-state.spec.ts`、`tests/server/exec-timeout.spec.ts`）

## 2. 客户端侧 exec 超时

- [x] 2.1 `figmaConsoleBackend.exec()` 外面套 race：budget 默认 `timeout + 5000`，`GISOP_EXEC_TIMEOUT_MS` 可覆盖（`execBudget` / `withExecBudget`）
- [x] 2.2 超时抛带 `code: 'V2_BRIDGE_NO_REPLY'` 的错误，message 含 `port / workerPid / supervisorPid / budget`
- [x] 2.3 race 里挂空 `catch`，超时后的 rejection 不会变成 unhandled rejection
- [x] 2.4 单测：child 不回复 → 预算内抛 `V2_BRIDGE_NO_REPLY`（`tests/server/exec-timeout.spec.ts`，用 30ms 预算 + 挂死 client）

## 3. 渲染入口探活

- [x] 3.1 `render.ts` 门控翻转为默认开：`process.env.GISOP_PREFLIGHT !== '0'`
- [x] 3.2 探活失败仍走 `retryTransient` 5×3s；最终失败返回 `V2_BRIDGE_DOWN`（补 `bridge` 快照）
- [x] 3.3 探活通过后写 `pluginConnected: true` + `lastRoundtripMs` 进 `bridgeState`（在 `healthCheck` 内）
- [x] 3.4 `render.ts` 的 `engineFields` 增加 `bridge` 快照，并在探活后刷新一次
- [x] 3.5 单测：探活失败不进入写路径（不调 `commitUndoCheckpoint`）；`bridge` 字段在成功与失败返回体里都在（`tests/v2/render-target-file.spec.ts`）

## 4. worker 探活（实施时改口径）

- [x] 4.1 worker 在 `v2Backend` 装配后做一次探活（8s 上限），**不阻塞等待重连**——Figma 没开是常态，启动阻塞 20s 会让宿主「连上了但半天不理人」；重连窗口交给 render 的 5×3s 探活重试
- [x] 4.2 探活失败只记 stderr，SHALL NOT 让 worker 退出
- [ ] 4.3 单测：boot 探活失败不阻断启动（需在 `entry-boot` 里注入假后端；当前 `entry-boot` 只覆盖「不装后端」路径）

## 5. 错误码与文档

- [x] 5.1 `V2_BRIDGE_NO_REPLY` 定义在 `bridgeState.ts`（`NO_REPLY_CODE`）；`createServer.ts` 的 render / get_skill_requirements 工具描述补桥诊断口径
- [x] 5.2 `docs/INSTALL.md` 补「渲染一直失败且 enginePid 每调都变」的判据、日志路径与 `V2_BRIDGE_DOWN` / `V2_BRIDGE_NO_REPLY` 对照
- [x] 5.3 `SETUP.md` MCP 配置表加 `GISOP_PREFLIGHT` / `GISOP_EXEC_TIMEOUT_MS`
- [x] 5.4 `packages/skill/phases/phase4-figma.md` 排查顺序加 `V2_BRIDGE_NO_REPLY` / `enginePid` 判据

## 6. 回归

- [x] 6.1 `npx tsc -p tsconfig.json` 通过
- [x] 6.2 `npx vitest run --no-file-parallelism` 全绿：80 files / 631 tests
- [ ] 6.3 真机：插件假死时 20s 内拿到 `V2_BRIDGE_NO_REPLY`，宿主日志**不再**出现 `self-heal triggered`（待真机，需要一台能复现假死的机器）
- [ ] 6.4 真机：正常环境渲染耗时增量 ≤1 次往返；`bridge` 快照字段与实际端口一致
- [x] 6.5 版本号三处一致（`package.json` 0.4.3 / `src/v2/version.ts` 0.4.3 / `manifest.json` skill 2.4.2 + `engineVersion ^0.4.3`）+ `CHANGELOG.md` + `openspec/HANDOFF.md`
