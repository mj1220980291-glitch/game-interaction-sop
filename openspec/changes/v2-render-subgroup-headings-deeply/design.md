## Context

`render.ts` 的 `fillCluster` 当前结构（post 备胎）：

```
fillCluster(cluster, ...)
  flatBullets = flattenGroups(cluster.groups)   ← 备胎：拍平所有 groups
  bulletTexts = scan(clusterNode, '正文/规则')
  clone/trim bulletTexts to match flatBullets.length
  setMultipleTextContents(flatBullets)
  decideRoleKeepDelete(primaryRoleFrame, cluster.roles)
  两路配图判定
```

目标结构（深度渲染）：

```
fillCluster(cluster, ...)
  if singleDefaultGroup(cluster.groups):
    ← 完全复用现有代码路径（向后兼容关键路径）
  else:
    for (idx, group) of cluster.groups:
      block = idx === 0 ? 复用 clusterNode 的第一个块 : cloneClusterBlock(source)
      if group.title != null:
        insertSubgroupTitleText(block, group.title)
      fillBullets(block, group.bullets)
      if idx === 0:
        decideRoleKeepDelete(block.roleFrame, cluster.roles)
      else:
        deleteNodes([block.roleFrame])
      if isImageGroup(group):
        保留/克隆 imageGroup
      else:
        deleteNodes([block.imagePlaceholder])
```

**核心问题**：说明块是 1:14 模板中的一个复合节点，由 3-4 种子节点构成，现有代码通过 `allDescendants` 扫描来定位各子节点。深度渲染需要对多个 block 重复这个扫描，且每个 block 克隆后的子节点 ID 是未知的——必须在克隆后重新 scan。

## Goals / Non-Goals

**Goals:**
- group ≥ 2 时每个 group 独立一个说明块
- 有 title 的 group 说明块顶部插入一行小标题 TEXT
- 角色标签 FRAME 只在第 1 个 group 的说明块里保留，其余删除
- 配图占位只在含 `配图：` bullet 的 group 的说明块里保留，其余删除
- 1-group + null 路径：与 v2 旧版渲染产物一致（验收方式：现有 16 个 parser 测试 + mcp-adapter 12 个测试全绿）
- 移除 `flattenGroups` 备胎函数

**Non-Goals:**
- 不修改气泡（bubble）逻辑——气泡仍然是"每个 `###` 簇一个气泡"，不因 group 数量变化
- 不改 parser / ir
- 不改 Figma 模板文件本身（只通过 API 操作现有模板节点）
- 不支持 group 内嵌套（`#####`）

## Decisions

### D1：新增 `cloneClusterBlock` helper，封装"克隆+扫描"

**问题**：每次克隆说明块后都需要：
1. `cloneNodeSafe({ sourceId: clusterNode.id, parentId: sectionNode.id })`
2. 重新 `getNodesInfo` 扫描新块的所有子节点，识别 subTitle / bulletText / roleFrame / imagePlaceholder

把这套流程封装为 `figma-client.ts` 里的 `cloneClusterBlock(backend, sourceId, parentId) -> ClusterBlockNodes`。

`ClusterBlockNodes` 结构：
```ts
interface ClusterBlockNodes {
  blockId: string;
  subTitle?: NodeInfo;          // TEXT, name === clusterSubTitle
  bulletSource?: NodeInfo;      // 第一个 TEXT, name === clusterBulletText
  allBulletTexts: NodeInfo[];
  roleFrame?: NodeInfo;         // FRAME, name starts with roleTagsFramePrefix
  imagePlaceholders: NodeInfo[]; // GROUP, name === optionalImagePlaceholder
}
```

### D2：第 1 个 group 复用现有 clusterNode，不重复克隆

第 1 个 group 对应的说明块就是 fillCluster 当前正在操作的 `clusterNode`。复用它可以：
- 减少一次 Figma API roundtrip
- 让现有的 subTitle / roleFrame / bulletText 扫描结果继续有效（即 `allDescendants` 第一次扫描的结果直接给 group[0] 用）

第 2..N 个 group 才调用 `cloneClusterBlock`。

### D3：小标题 TEXT 的插入策略

`insertSubgroupTitleText(block: ClusterBlockNodes, title: string)`:
- 找 `block.subTitle`（模板里已有的"子标号" TEXT 节点，`name === clusterSubTitle`）
- 若存在：直接 `setTextContent(block.subTitle.id, title)`（改文字，位置不动）
- 若不存在（模板某版本可能没这节点）：克隆 `block.bulletSource` 作为新 TEXT，setTextContent，然后 moveNode 到 bulletSource 之上 4px（FRAME-local）

这样优先用模板已有节点，不引入新的节点类型，和 Bug 5 / Bug 9 的现有逻辑保持一致。

### D4：配图占位归属于"含 `配图：` bullet 的 group"

一个簇里最多一张配图（语义上），所以只有一个 group 的 bullets 会有 `配图：` 开头的 bullet。

策略：
```
for each group in cluster.groups:
  if group.bullets.some(isImageBullet):
    该 group 的说明块保留 imagePlaceholder（如不存在则克隆 seedImageGroupId）
  else:
    该 group 的说明块删除 imagePlaceholder（如存在）
```

### D5：向后兼容路径——零改动

判断条件：`cluster.groups.length === 1 && cluster.groups[0].title === null`

满足时，直接走现有代码（包括现有的 `bulletTexts` 扫描、clone/trim、setMultipleTextContents、decideRoleKeepDelete、配图两路判定）。不调用任何新函数。这条路径有 36 个测试护着。

## Risks / Trade-offs

- **R1：多次克隆说明块增加 Figma API roundtrip 数量**
  - 缓解：每次克隆后立即批量扫描子节点（`getNodesInfo` 批量调用），把 N 个子节点用 1 次 roundtrip 取回，不逐个查询
- **R2：cloneClusterBlock 的 parent 选择影响布局**
  - 缓解：parent 始终用 `clusterNode.parentId`（说明块在模板里的父节点），这与第 1 块的位置一致；Figma 会自动在 AUTO_LAYOUT 父节点里追加克隆
- **R3：setMultipleTextContents 跨多块调用复杂度**
  - 缓解：每个 group 各收集一批 `{nodeId, characters}`，最后合并成一次 `setMultipleTextContents` 调用，减少 roundtrip
- **R4：移除 `flattenGroups` 后任何直接依赖它的代码编译失败**
  - 缓解：在删除前 `grep_search` 确认无外部引用；build 后 tsc 强制校验

## Open Questions

- **Q1**：`clusterSubTitle` TEXT 是模板的固定节点还是可选节点？（当前代码已有对它的 keep-first 处理，推测为固定节点，待验证）
- **Q2**：多个说明块在 Figma 里的纵向间距——模板是 AUTO_LAYOUT 还是手动定位？若是 AUTO_LAYOUT，克隆后 Figma 会自动排版，无需手动 move；若不是，需要计算 Y 偏移。待真实 API 调用时确认（如不是 AUTO_LAYOUT，渲染结果可能重叠，需加 moveNode 补偿）。
