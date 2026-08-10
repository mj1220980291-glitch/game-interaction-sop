## 1. IR 层

- [x] 1.1 `src/v2/ir.ts` 新增 `BulletGroup` 接口（`title: string | null` + `bullets: string[]`）
- [x] 1.2 `SemanticCluster` 增加 `groups: BulletGroup[]` 字段；**决定保留 `bullets`** 并明确标注为 `groups` 的派生拍平视图（parser 唯一写入方）。理由：`needsImage` / 章节级统计等跨分组判断天然按整簇取值，保留派生字段比每处重写 flatMap 更不易漏，同时让不关心分组的调用方零改动
- [x] 1.3 新增错误码 `H_H4_ORPHAN` / `H_GROUP_TITLE_LEN_OVERFLOW` / `H_GROUP_TITLE_DUPLICATE` 与软警告码 `W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS`

## 2. Parser 层

- [x] 2.1 移植 `displayWidth()` 与 `GROUP_TITLE_MAX_WIDTH = 24`（中文字符计 2）
- [x] 2.2 移植 `parseClusterGroups()`：跳过 `@role` 行 → 按 `####` 锚点切组 → `rawGroups[0]` 为隐式分组
- [x] 2.3 实现 G1 校验：`####` 出现在 `## NN.` 直属内容区（无 `###` 包裹）→ `H_H4_ORPHAN`
- [x] 2.4 实现 G2 校验：标题显示宽度 > 24 → `H_GROUP_TITLE_LEN_OVERFLOW`
- [x] 2.5 实现 G3 校验：同簇内 `####` 标题重复（大小写不敏感）→ `H_GROUP_TITLE_DUPLICATE`
- [x] 2.6 实现 W5 软警告：`####` 之前存在游离 bullet → `W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS`，不阻塞
- [x] 2.7 重新定义 `stripH4` 语义：默认路径不再静默丢弃 `####`，该 flag 降级为「恢复分组实现之前形态」的历史兼容开关，注释已说明只供旧 fixture 断言使用
- [x] 2.8 `parseClusters` 对每个簇调用 `parseClusterGroups`，无 `####` 时产出单个 `{ title: null, bullets }` 分组

## 3. Render 层

- [x] 3.1 **偏离原方案**：不实现 `cloneClusterBlock()`。分组块改为在 `renderSection` 的块预算阶段一次性 `batchCloneNodes`。原因：右栏是 AUTO_LAYOUT 且后端只支持 append，在 `fillCluster` 内部补克隆会让分组块排到全章节所有说明块之后，顺序错乱
- [x] 3.2 `writeSubgroupTitle()`：优先写入模板 `#Title` TEXT；不存在时克隆 bulletSource TEXT 并定位在 bullets 上方 4px（FRAME-local）；`title === null` 时删除该槽位
- [x] 3.3 `fillGroupBlocks()`：group[0] 复用现有说明块，group[1..N] 使用预算阶段已备好的块
- [x] 3.4 角色标签 FRAME 只保留在 group[0] 并执行 keep-first 删除；group[1..N] 的说明块整体删除角色标签 FRAME
- [x] 3.5 配图占位只保留在含 `配图：` bullet 的 group，其余 group 删除 imagePlaceholder；归属 group 的 `配图占位文案` 正常写入
- [x] 3.6 删除「无条件删除所有 `#Title`」逻辑，改为：无 `####` 时全删（防占位泄漏），有 `####` 时 keep-first + 按分组填充
- [x] 3.7 向后兼容快路径：`groups.length <= 1 && groups[0].title === null` 时走原扁平逻辑，调用序列不变
- [x] 3.8 复用已缓存的 `allDescendants`；仅对新增的 group 块各做 1 次 `scanSubtree`，未新增 `getNodeInfo` 往返
- [x] 3.9 **超出原方案**：group[1..N] 的说明块同时删除 `Number`（气泡编号）与 `#Title_Main`（簇主标题）。一个簇在主图上只有 1 个气泡，逐块重复编号会让读者误以为有 N 个气泡

## 4. 测试

- [x] 4.1 parser：`####` 正常切组、隐式分组、G1/G2/G3 硬错误、W5 软警告、边界宽度 24 —— `tests/v2/parser-subgroups.spec.ts`（10 例）
- [x] 4.2 render：覆盖 spec `figma-template-1-14-rendering` 的全部 Scenario —— `tests/v2/render-subgroups.spec.ts`（8 例）
- [x] 4.3 回归：不含 `####` 的文档，backend 调用序列与本 change 前逐项一致。基线由 `git stash` 回退 src 后实测录得，写死在 `BASELINE_CALL_SEQUENCE`
- [x] 4.4 全量 8 文件 70 测试通过，`npx tsc -p packages/figma-mcp-server/tsconfig.json --noEmit` 零错误
- [x] 4.5 mock backend 抽到 `tests/v2/helpers/mock-backend.ts`，并补齐模板真实存在的 `#Title` ×2 与 `配图` GROUP

## 5. 验证与收尾

- [ ] 5.1 端到端：用含 `####` 的真实文档跑 Phase 4，Figma 内每个分组各自成块且小标题正确（需 Figma 桌面端 + Bridge 插件在线）
- [ ] 5.2 端到端：用不含 `####` 的既有文档跑 Phase 4，产物与修改前一致
- [x] 5.3 已核对 `markdown-v2-spec.md:66-68` 的 G1/G2/G3 与 `:81` 的 W5，错误码、触发条件、宽度阈值均与实现一致，无需修订
- [x] 5.4 删除 `reference/` 素材目录。engine 快照仍可从 commit `4406ee7` 的树中取回
