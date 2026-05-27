## ADDED Requirements

### Requirement: FigmaBackend 提供 scanSubtree 方法

`FigmaBackend` interface SHALL 新增 `scanSubtree(rootId: string, maxNodes?: number): Promise<ScanSubtreeResult>` 方法，其中 `ScanSubtreeResult` 为 `{ nodes: NodeInfo[]; truncated: boolean }`。

#### Scenario: 正常子树一次返回

- **WHEN** 调用 `backend.scanSubtree(rootId)`，子树节点数 ≤ maxNodes（默认 500）
- **THEN** 返回值 `nodes` SHALL 包含以 rootId 为根的所有后代节点（含 root 自身），`truncated` SHALL 为 `false`

#### Scenario: 超限时 truncated 为 true

- **WHEN** 调用 `backend.scanSubtree(rootId, maxNodes)` 且实际节点数超过 maxNodes
- **THEN** `nodes` SHALL 包含前 maxNodes 个节点（BFS 顺序），`truncated` SHALL 为 `true`

#### Scenario: rootId 不存在时返回空

- **WHEN** 传入的 rootId 对应节点在文档中不存在
- **THEN** 返回值 SHALL 为 `{ nodes: [], truncated: false }`

### Requirement: figmaConsoleBackend 实现 scanSubtree 单次 RTT

`figmaConsoleBackend` 的 `scanSubtree` 实现 SHALL 在单次 `figma_execute` 调用内完成 BFS 遍历，不得发出多次 `figma_execute` 调用。

#### Scenario: 16 簇文档查询 RTT 总数

- **WHEN** 用含 16 个 cluster 的文档（如选秀环节文档）跑完整渲染
- **THEN** 来自 scanSubtree 路径的 `figma_execute` 调用总次数 SHALL ≤ 20（≈ 每 cluster 1 次 + findSeedImageGroup 3 次 + 余量）

### Requirement: render.ts 切换到 scanSubtree 并支持 truncated 降级

render.ts 的 `scanAllDescendants`、`indexCloneByName`、`findSeedImageGroup` 调用点 SHALL 优先调用 `backend.scanSubtree()`；当 `truncated === true` 时 SHALL fallback 到原 `scanAllDescendants` 并向 stderr 输出 warning。

#### Scenario: 正常路径使用 scanSubtree

- **WHEN** `scanSubtree` 返回 `truncated: false`
- **THEN** render.ts SHALL 直接使用返回的 `nodes` 数组，不再调用 `backend.getNodeInfo` 做 BFS

#### Scenario: truncated 时自动降级

- **WHEN** `scanSubtree` 返回 `truncated: true`
- **THEN** render.ts SHALL 调用原 `scanAllDescendants` 作为 fallback，并向 stderr 输出包含节点 id 的 warning 信息
