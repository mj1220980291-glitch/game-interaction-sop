## 1. figma-client.ts — 新增 ClusterBlockNodes 接口与 cloneClusterBlock helper

- [x] 1.1 在 `figma-client.ts` 新增 `ClusterBlockNodes` 接口：`{ blockId, subTitle?, bulletSource?, allBulletTexts, roleFrame?, imagePlaceholders }`
- [x] 1.2 实现 `cloneClusterBlock(backend, sourceId, parentId)` 函数：调用 `cloneNodeSafe` 克隆源块，然后 `getNodesInfo` 批量扫描所有子节点，按名字分类填充 `ClusterBlockNodes` 并返回

## 2. render.ts — 重构 fillCluster

- [x] 2.1 在 `fillCluster` 顶部加判断：`isSingleDefaultGroup = cluster.groups.length === 1 && cluster.groups[0].title === null`；为 true 时走现有代码路径（用 `flatBullets = cluster.groups[0].bullets` 替换原 `flattenGroups` 调用），其余逻辑不动
- [x] 2.2 为 multi-group 路径（`!isSingleDefaultGroup`）新增 `fillClusterMultiGroup` 子函数：
  - 第 1 个 group 用现有 `allDescendants` 扫描结果（不重复克隆）
  - 第 2..N 个 group 各调用 `cloneClusterBlock(backend, clusterNode.id, clusterNode.parentId!)` 产出新说明块
- [x] 2.3 实现 `insertSubgroupTitleText(backend, block: ClusterBlockNodes, title: string)`：优先写 `block.subTitle`；若无则克隆 `block.bulletSource`，setTextContent，moveNode 至 bulletSource 上方 4px（FRAME-local）
- [x] 2.4 `fillBulletsForBlock`：把单 group 的 bullets 写入某一说明块（提取现有 clone/trim/setMultipleTextContents 逻辑为可复用函数）
- [x] 2.5 角色标签逻辑：group index=0 时保留并执行 keep-first 删除；index > 0 时直接 `deleteNodes([block.roleFrame.id])` 整体删除
- [x] 2.6 配图占位逻辑：对每个 group 独立判断 `group.bullets.some(isImageBullet)`，分别保留/克隆/删除各自说明块的 imagePlaceholder
- [x] 2.7 全部 group 处理完后合并 bulletUpdates，一次 `setMultipleTextContents` 批量提交（减少 roundtrip）
- [x] 2.8 **删除** `flattenGroups` 函数及 `fillCluster` 里对它的调用；`grep_search` 确认无其他引用后删除

## 3. 测试

- [x] 3.1 `parser.spec.ts` 现有 24 个用例仍然全绿（无需改动，只需 `npm run test` 通过）
- [ ] 3.2 在 `mcp-adapter/tests/figma-console-backend.spec.ts` 新增 2 个断言：
  - **2-group 簇**：spy `cloneNode`，验证 render 过程中 `cloneNode` 被调用恰好 1 次（第 2 个 group 的说明块克隆）
  - **1-group + null title 簇**：spy `cloneNode`，验证调用次数与旧版一致（0 次说明块克隆）
- [x] 3.3 新增 fixture `tests/fixtures/subgroup-render-2group.md`（含 `####` 的完整文档），在 `parser.spec.ts` 加一条 IR smoke（不测 Figma 侧）

## 4. 验证与收尾

- [x] 4.1 `npm run build` 无 TypeScript 错误
- [x] 4.2 `npm run test`（目标：engine 24 + adapter ≥ 14 = ≥ 38 全绿）实测 engine 29 + adapter 12 = 41 全绿
- [x] 4.3 `npm run test-parse` 验证 example IR 产出正确（groups 结构保持）
- [ ] 4.4 `npm run release` 重打 zip，确认大小合理（不超过旧版 +50KB）
- [ ] 4.5 在 `openspec/changes/v2-render-subgroup-headings-deeply/design.md` 的 Open Questions 里补充 Q1/Q2 的实测答案
