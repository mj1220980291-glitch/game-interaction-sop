## Context

两处 while-loop：

**热点 1：`fillCluster()` bullet clone（约 line 491-497）**
```typescript
while (bulletNodes.length < cluster.bullets.length && bulletSource) {
  const clone = await cloneNodeSafe(backend, {
    sourceId: bulletSource.id,
    parentId: bulletSource.parentId
  });
  bulletNodes.push(clone);
}
```
16 簇 × 平均 8 条 bullet = 128 次 `cloneNodeSafe`，其中大部分都是"需要额外 clone"的情况（模板初始只有 1 个 bullet 节点）。

**热点 2：`renderSection()` cluster block clone（约 line ~320-340）**
```typescript
while (clusterNodes.length < section.clusters.length) {
  const clone = await cloneNodeSafe(backend, {
    sourceId: masterClusterBlock.id,
    parentId: rightColId
  });
  clusterNodes.push(clone);
}
```
每章节需要 clusters.length - 1 次 clone，3 章 × 平均 5 次 = ~15 次。

两处合计 ~143 次 clone RTT × 0.4s ≈ 57s。

## Goals / Non-Goals

**Goals:**

- 新增 `FigmaBackend.batchCloneNodes({ sourceId, parentId, count })` 方法
- `fillCluster` 和 `renderSection` 的 clone while-loop 改为一次 `batchCloneNodes` 调用
- 克隆顺序 = appendChild 顺序（和原来逐个 clone 一致）
- `count=0` 时返回空数组，不调用 figma_execute

**Non-Goals:**

- 不支持 clone 到不同 parent（一次调用 = 一个 parent）
- 不合并 clone + setText 进同一次 exec（保持 read/write 路径分离）
- 不改 Change 2 已完成的 scanSubtree

## Decisions

### D1：clone 顺序保证

plugin script 内用 `for (let i = 0; i < count; i++) { const c = src.clone(); parent.appendChild(c); result.push(await serNode(c)); }` 顺序循环，每次 `appendChild` 都追加到 parent 末尾，顺序与原 while-loop 一致。

### D2：count=0 短路

`if (count <= 0) return { nodes: [] }` 在 TS 侧直接返回，不发 figma_execute。原 while-loop `count=0` 时不执行，行为等价。

### D3：返回值直接用于替换 bulletNodes / clusterNodes

`batchCloneNodes` 返回 `NodeInfo[]`，调用方直接拼接到现有数组尾部，与原 while-loop 行为完全等价。

### D4：clone 失败时整体报错

plugin script 内如果 `sourceId` 不存在，throw Error，TS 层不 catch，让渲染流程正常中断。原 while-loop 调用 `cloneNodeSafe` 也是遇到错误直接 throw，行为一致。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| plugin 内 clone 后 serNode 顺序错乱（理论上不会） | e2e 测试验证 bullet 文本与 Markdown 顺序一致 |
| 单次 exec 内 clone N 份接近 30s budget（极端情况） | 16 簇文档最大 N ≈ 10；一次 clone+serNode 约 50-100ms in plugin → 10次 <1s，远离 timeout |
| render.ts 里 bulletSource.parentId 为 GROUP 触发 GROUP_PARENT 安全错误 | batchCloneNodes 内部执行前检查 parent 类型，沿用 cloneNodeSafe 的 GROUP 保护逻辑 |

## Migration Plan

1. 扩展 interface
2. 实现 figmaConsoleBackend.batchCloneNodes
3. 改 render.ts 两处 while-loop
4. 跑 e2e 冒烟（选秀环节文档）验证 bullet 内容 + 顺序
5. 无存储 migration

## Open Questions

无。
