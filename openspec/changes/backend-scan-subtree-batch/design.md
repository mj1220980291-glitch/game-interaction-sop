## Context

`scanAllDescendants(backend, rootId)` 是 render.ts 中的核心辅助函数，使用 TypeScript 控制流做 BFS，每轮循环调用一次 `backend.getNodeInfo(id)` 或 `backend.getNodesInfo(ids[])`。每次调用对应一次 MCP transport RTT（LLM → MCP server → Desktop Bridge WebSocket → Figma plugin sandbox → 返回），平均约 400ms。

三个调用点：
1. `fillCluster()` 开头 → 获取整个 cluster block 的所有子节点
2. `indexCloneByName()` → 按名字查找特定节点（BFS 提前退出优化）
3. `findSeedImageGroup()` → 遍历 section 子树找配图 GROUP

16 簇文档：`fillCluster` × 16 + `findSeedImageGroup` × 3 ≈ 400+ 次 `getNodeInfo` RTT。

## Goals / Non-Goals

**Goals:**

- 新增 `FigmaBackend.scanSubtree(rootId, maxNodes?)` 方法，一次 `figma_execute` 返回整棵子树的 NodeInfo 扁平数组
- render.ts 三个 BFS 调用点切换到 `scanSubtree`
- 节点数上限（默认 500）在 plugin script 内部强制，超限返回 `truncated: true` 并 warn
- render.ts 收到 `truncated: true` 时 fallback 到原 `scanAllDescendants`（保险降级）

**Non-Goals:**

- 不合并 write 操作（clone/setText）进同一次 exec，那是 Change 3 的事
- 不改 engine 包
- 不改 Markdown 格式

## Decisions

### D1：返回值结构带 truncated 标志

```typescript
interface ScanSubtreeResult {
  nodes: NodeInfo[];
  truncated: boolean;
}
```

原因：plugin 内 BFS 如果 maxNodes 到达上限，不应静默丢节点（调用方需感知）。render.ts 检测到 truncated 后 warn + fallback 到旧路径，不会因截断导致节点找不到。

### D2：maxNodes 默认 500，与原 scanAllDescendants 一致

原因：保持行为等价。一个 cluster block 子节点通常 20-50 个，section 子树最多 200-300 个，500 的上限绰绰有余，不会误 truncate。

### D3：plugin script 用 async walk 递归，不用迭代队列

原因：Figma plugin sandbox 内 `getNodeByIdAsync` 不需要额外 RTT（直接访问 in-process document），递归或迭代均可；递归写法更简洁，且 `children` 属性是同步可访问的（不需要 async），没有栈溢出风险（DOM 深度 < 20 层）。

### D4：`scanAllDescendants` 保留为 fallback，不立即删除

原因：truncated 降级路径需要它；删除留到 Change B（统一 parser/IR）时一并清理。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| plugin script 内 walk 遇到超大文件超 30s timeout | maxNodes=500 保护；实测 cluster 子树 < 100 节点，远不到上限 |
| `scanSubtree` 返回顺序与旧 BFS 不一致导致下游逻辑错误 | render.ts 下游均通过 `.filter(n => n.name === xxx)` 按名匹配，不依赖顺序 |
| mock backend 测试覆盖不到真实 plugin 内存行为 | 真实 e2e 用选秀环节文档做冒烟；mock 测试验证"返回 NodeInfo 数组被正确消费" |

## Migration Plan

1. `figma-client.ts` 增加 `scanSubtree` 接口
2. `figmaConsoleBackend.ts` 实现 `scanSubtree`
3. `render.ts` 改三处调用点，保留 fallback
4. 跑测试
5. e2e 冒烟（选秀环节文档），对比渲染时间 before/after
6. 无存储 migration

## Open Questions

无。
