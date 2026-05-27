# backend-batch-clone-nodes Specification

## Purpose
TBD - created by archiving change backend-batch-clone-nodes. Update Purpose after archive.
## Requirements
### Requirement: FigmaBackend 提供 batchCloneNodes 方法

`FigmaBackend` interface SHALL 新增 `batchCloneNodes(p: { sourceId: string; parentId: string; count: number }): Promise<NodeInfo[]>` 方法。

#### Scenario: count > 0 时返回 N 个克隆

- **WHEN** 调用 `backend.batchCloneNodes({ sourceId, parentId, count: N })` 且 N > 0
- **THEN** 返回长度为 N 的 `NodeInfo[]`，每个元素为成功 clone 并 appendChild 到 parentId 的新节点，顺序与 appendChild 顺序一致

#### Scenario: count = 0 时返回空数组且不调用 figma_execute

- **WHEN** 调用 `backend.batchCloneNodes({ ..., count: 0 })`
- **THEN** SHALL 返回空数组 `[]`，且 SHALL NOT 发出 `figma_execute` MCP 调用

#### Scenario: sourceId 不存在时抛出错误

- **WHEN** 传入的 sourceId 在文档中不存在
- **THEN** SHALL 抛出 Error，渲染流程中断

### Requirement: figmaConsoleBackend 在单次 figma_execute 内完成 N 次 clone

`figmaConsoleBackend` 的 `batchCloneNodes` 实现 SHALL 在单次 `figma_execute` 调用内完成所有 N 次 `src.clone()` + `parent.appendChild()` 操作，不得发出多次 MCP 调用。

#### Scenario: 克隆顺序等价于逐次串行 clone

- **WHEN** 使用 `batchCloneNodes(count=3)` 替换原来 3 次串行 `cloneNodeSafe`
- **THEN** parent 子节点列表中新增的 3 个 clone 的顺序 SHALL 与原串行方式一致（均为追加到末尾）

### Requirement: render.ts 两处 while-loop 改为 batchCloneNodes

render.ts 的 bullet clone while-loop（`fillCluster`）和 cluster block clone while-loop（`renderSection`）SHALL 改为调用 `backend.batchCloneNodes()`，计算所需 `count = target - existing`。

#### Scenario: 需要 0 个额外 clone 时不调用 batchCloneNodes

- **WHEN** 模板中已有足够的 bullet/cluster 节点（count ≤ 0）
- **THEN** render.ts SHALL 直接使用已有节点，不调用 `batchCloneNodes`

#### Scenario: 16 簇文档 clone RTT 总数下降

- **WHEN** 用含 16 个 cluster 的文档（如选秀环节文档）跑完整渲染（依赖 Change 2 已完成）
- **THEN** 来自 clone 路径的 `figma_execute` 调用总次数 SHALL ≤ 20

