## Why

`render.ts` 里的 `scanAllDescendants()` 通过逐节点 BFS 查找子树，每个节点一次 `figma_execute` RTT（约 0.4s）。一个 16 簇文档触发约 420 次这类查询 RTT，是总耗时 250s 的第二大热点（第一大是 bullet clone，由 Change 3 解决）。

将 BFS 逻辑内联到单次 `figma_execute` script 里让 Figma plugin 在沙箱内自行遍历，一次返回完整子树扁平数组，可把 ~420 RTT 压缩到 ~14 RTT，预计整体渲染时间从 250s 降至 ~40s。

## What Changes

- `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts`：新增 `scanSubtree(rootId, maxNodes?)` 方法，BFS 在 plugin 沙箱内执行，一次返回整棵子树
- `packages/figma-mcp-server/src/v2/figma-client.ts`：在 `FigmaBackend` interface 新增 `scanSubtree` 方法签名
- `packages/figma-mcp-server/src/v2/render.ts`：将 `scanAllDescendants()`、`indexCloneByName()`、`findSeedImageGroup()` 三处 BFS 调用改为调用 `backend.scanSubtree()`

## Capabilities

### New Capabilities

- `backend-scan-subtree`: figmaConsoleBackend 的 `scanSubtree` 能力——单次 figma_execute 内完成子树 BFS，返回扁平 NodeInfo 数组，含 truncated 标志

### Modified Capabilities

（无：render.ts 逻辑不变，只换底层查询方式；FigmaBackend interface 向后兼容扩展）

## Impact

- **代码**：`figmaConsoleBackend.ts`（+20 行）、`figma-client.ts`（+5 行接口）、`render.ts`（改 3 处调用点）
- **性能**：query RTT ~420 → ~14，整体渲染 ~250s → ~40s（与 Change 3 合计）
- **测试**：`figmaConsoleBackend` 需要 mock backend 测试，验证 `scanSubtree` 返回正确的 NodeInfo 扁平数组
- **Breaking**：无；旧 `scanAllDescendants` 函数可保留为 fallback，后续再删
