## Why

`npm run build` 会替换 worker 进程，但旧 worker 拉起的 `figma-console-mcp` 子进程树不一定被清掉：它继续占着 Bridge 的首选端口 `9223`，新 worker 只好退到 `9224`。插件只扫一次端口（启动时），永远连不上新服务；更糟的是两个实例并存时 `figma_get_status` 说「已连 9224」，而 `figma_execute` 仍去敲 `9223`。

现有 `reclaimPorts.ts` 只回收**孤儿**（父进程已死）。今天四次中断里，旧实例的父链是活的，所以被跳过，必须人工重启 MCP 才能恢复。

## What Changes

- 新增「抢回首选端口」：spawn 子进程前，若 `9223` 被另一个 `figma-console-mcp` 进程占用且不是本进程的后代，连进程树一起杀掉。
- 端口占用者识别：Windows 走 `netstat -ano` + `wmic` 命令行；POSIX 走 `lsof` + `ps`。只认命令行里带 `figma-console-mcp` 的 node 进程，其他程序（用户自己的服务）绝不碰。
- 判定函数做成纯函数（解析 + 决策），补单测；`reclaimOrphanedBridgePorts()` 保留原职责。
- 启动日志明确记录「抢回 9223 / 跳过原因」，出现漂移时一眼能看出是谁占着。

## Capabilities

### New Capabilities
- `bridge-port-stability`: 引擎启动时保证首选 Bridge 端口可用，或明确记录为何不可用。

### Modified Capabilities
<!-- 现有 spec 无端口回收相关要求，本次只新增能力 -->

## Impact

- `packages/figma-mcp-server/src/server/reclaimPorts.ts`：新增端口占用解析与抢占
- `packages/figma-mcp-server/src/server/worker.ts`：spawn 前调用
- 测试：`tests/server/reclaim-ports.spec.ts`（纯函数）
- 不改 figma-console-mcp 依赖，不改插件
