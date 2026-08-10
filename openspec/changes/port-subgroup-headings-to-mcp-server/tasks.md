## 1. IR 层

- [ ] 1.1 `src/v2/ir.ts` 新增 `BulletGroup` 接口（`title: string | null` + `bullets: string[]`），参考 `reference/engine-ir.ts.txt` L52-61
- [ ] 1.2 `SemanticCluster` 增加 `groups: BulletGroup[]` 字段；保留现有 `bullets` 字段或标记 deprecated（二选一，需在实现时定夺并记录理由）
- [ ] 1.3 新增错误码 `H_H4_ORPHAN` / `H_GROUP_TITLE_LEN_OVERFLOW` / `H_GROUP_TITLE_DUPLICATE` 与软警告码 `W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS`

## 2. Parser 层

- [ ] 2.1 移植 `displayWidth()` 与 `GROUP_TITLE_MAX_ASCII = 24`（中文字符计 2）
- [ ] 2.2 移植 `parseClusterGroups()`：跳过 `@role` 行 → 按 `####` 锚点切组 → `rawGroups[0]` 为隐式分组
- [ ] 2.3 实现 G1 校验：`####` 出现在 `## NN.` 直属内容区（无 `###` 包裹）→ `H_H4_ORPHAN`
- [ ] 2.4 实现 G2 校验：标题显示宽度 > 24 → `H_GROUP_TITLE_LEN_OVERFLOW`
- [ ] 2.5 实现 G3 校验：同簇内 `####` 标题重复（大小写不敏感）→ `H_GROUP_TITLE_DUPLICATE`
- [ ] 2.6 实现 W5 软警告：`####` 之前存在游离 bullet → `W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS`，不阻塞
- [ ] 2.7 重新定义 `stripH4` 语义：groups 实现后原「静默丢弃 `####` 行」的补丁必须移除或降级为兼容开关，并更新 `parser.ts:364-369` 的文档注释
- [ ] 2.8 `parseClusters` 对每个簇调用 `parseClusterGroups`，无 `####` 时产出单个 `{ title: null, bullets }` 分组

## 3. Render 层

- [ ] 3.1 移植 `cloneClusterBlock()`，返回 `{ blockId, subTitle, bulletSource, allBulletTexts, roleFrame, imagePlaceholders }`；改用 `batchCloneNodes` 而非逐个 `cloneNodeSafe`
- [ ] 3.2 移植 `insertSubgroupTitleText()`：优先写入模板 `subTitle` TEXT；不存在时克隆 bulletSource TEXT 并定位在 bullets 上方 4px（FRAME-local）
- [ ] 3.3 移植 `fillClusterGroups()`：group[0] 复用现有说明块，group[1..N] 各克隆一块
- [ ] 3.4 角色标签 FRAME 只保留在 group[0] 并执行 keep-first 删除；group[1..N] 的说明块整体删除角色标签 FRAME
- [ ] 3.5 配图占位只保留在含 `配图：` bullet 的 group，其余 group 删除 imagePlaceholder
- [ ] 3.6 删除 `render.ts:573-578`「无条件删除所有 `#Title`」逻辑，改为 keep-first + 按分组填充
- [ ] 3.7 实现向后兼容快路径：`groups.length === 1 && groups[0].title === null` 时不调用任何新函数，走原扁平逻辑
- [ ] 3.8 复用已缓存的 `allDescendants`，不新增 `getNodeInfo` 往返

## 4. 测试

- [ ] 4.1 parser：`####` 正常切组、隐式分组、G1/G2/G3 硬错误、W5 软警告，各至少 1 例
- [ ] 4.2 render：覆盖 spec `figma-template-1-14-rendering` 的 5 个 Scenario（单 group 向后兼容 / 双 group 独立说明块 / 配图归属 group / 第 2..N 块角色标签整体删除 / cloneClusterBlock 返回完整集合）
- [ ] 4.3 回归：不含 `####` 的既有 fixture 渲染调用序列与本 change 前逐字节一致
- [ ] 4.4 全量测试通过，`npx tsc -p packages/figma-mcp-server/tsconfig.json` 零错误

## 5. 验证与收尾

- [ ] 5.1 端到端：用含 `####` 的真实文档跑 Phase 4，Figma 内每个分组各自成块且小标题正确
- [ ] 5.2 端到端：用不含 `####` 的既有文档跑 Phase 4，产物与修改前一致
- [ ] 5.3 确认 `markdown-v2-spec.md` 的 G1/G2/G3/W5 描述与实现完全对齐，有出入则以实现为准修订规范
- [ ] 5.4 删除 `reference/` 素材目录（移植完成后不再需要）
