## Why

`render.ts` 里有两处 while-loop 串行 clone：① `fillCluster` 里补充 bullet TEXT 节点（每条 bullet 一次 `cloneNodeSafe` = 一次 RTT）；② `renderSection` 里补充 cluster block（每个额外 cluster 一次 clone）。16 簇文档约 140 次 clone RTT，占总耗时的第一大热点（~56s）。

将"N 次串行 clone"改为单次 `figma_execute` 内 plugin 沙箱循环 clone，可把 clone RTT 从 ~140 次压缩到 ~14 次（每个调用点一次）。配合 Change 2（scanSubtree），两个 change 合计将总渲染时间从 ~250s 降至 ~15-20s。

## What Changes

- `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts`：新增 `batchCloneNodes({ sourceId, parentId, count })` 方法，单次 `figma_execute` 内 clone N 份并返回所有克隆节点的 NodeInfo 数组
- `packages/figma-mcp-server/src/v2/figma-client.ts`：在 `FigmaBackend` interface 新增 `batchCloneNodes` 方法签名
- `packages/figma-mcp-server/src/v2/render.ts`：将 `fillCluster` 里的 bullet clone while-loop 和 `renderSection` 里的 cluster block clone while-loop 改为调用 `backend.batchCloneNodes()`

## Capabilities

### New Capabilities

- `backend-batch-clone-nodes`: figmaConsoleBackend 的 `batchCloneNodes` 能力——单次 figma_execute 内 clone N 份同源节点到同一 parent，返回 NodeInfo[]

### Modified Capabilities

（无）

## Impact

- **代码**：`figmaConsoleBackend.ts`（+20 行）、`figma-client.ts`（+5 行接口）、`render.ts`（改 2 处 while-loop）
- **性能**：clone RTT ~140 → ~14，配合 Change 2 整体渲染 ~40s → ~15-20s
- **风险**：写操作，clone 顺序需验证（详见 design.md）
- **Breaking**：无
