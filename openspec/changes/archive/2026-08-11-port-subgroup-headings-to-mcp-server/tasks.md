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

> **方案返工（2026-08-11）**：3.1–3.9 最初实现为「一个 group 一个说明块」，端到端前
> 用 Bridge 读了真模板才发现，一个 `说明块` 本身就自带 2 段子分类槽位
> （`#Title + Frame4273 + 正文×2 + 配图`），簇级编号与主标题在顶部只出现一次。
> 旧方案还有个测试测不出的视觉缺陷：跟随块删掉 `Number` TEXT 后，画蓝色圆圈的
> `Base` VECTOR 仍在，图上会留空心圆。根因是我照着 `template-map.ts` 的过时描述
> 设计，没有先看真模板。下列条目为返工后的最终形态。

- [x] 3.1 撤销跨簇块预算，`renderSection` 恢复到改动前形态（`wanted = clusters.length`）。`####` 全部收敛在单个说明块内处理，不再需要按 group 数预算块
- [x] 3.2 `splitSlotRuns()`：以每个 `#Title` 为锚点切分说明块的直接子节点；首个 `#Title` 之前的节点是簇级表头，永不克隆、永不删除
- [x] 3.3 `fillGroupSlots()`：按 `groups` 顺序克隆新槽位段追加到块尾，再整体删除模板原有槽位段。「先建后删」是绕开 AUTO_LAYOUT 只能 append 的唯一办法，同时让每段按需精确组装而非克隆后裁剪
- [x] 3.4 角色标签 FRAME 只克隆给第 1 段；`@角色` 是 `###` 簇级声明，逐段重复只是噪音
- [x] 3.5 `配图` 只克隆给声明了 `配图：xxx` 的组，并把描述写入其 `配图占位文案`；`配图` bullet 不占正文槽位
- [x] 3.6 `title === null`（W5 隐式首组）不克隆 `#Title`，杜绝「小标题1」占位泄漏
- [x] 3.7 簇级表头原样保留，不再删 `Number` / `#Title_Main` —— 一个簇只有一个气泡，表头本就该只有一份，也就不存在空心蓝圆
- [x] 3.8 无 `####` 的快路径完全不变，调用序列由回归测试逐项锁死
- [x] 3.9 非规范模板（块内一个 `#Title` 都没有）降级为扁平渲染，保证内容永不丢失

## 4. 测试

- [x] 4.1 parser：`####` 正常切组、隐式分组、G1/G2/G3 硬错误、W5 软警告、边界宽度 24 —— `tests/v2/parser-subgroups.spec.ts`（10 例）
- [x] 4.2 render：覆盖 spec `figma-template-1-14-rendering` 的全部 Scenario —— `tests/v2/render-subgroups.spec.ts`（8 例）
- [x] 4.3 回归：不含 `####` 的文档，backend 调用序列与本 change 前逐项一致。基线由 `git stash` 回退 src 后实测录得，写死在 `BASELINE_CALL_SEQUENCE`
- [x] 4.4 全量 8 文件 70 测试通过，`npx tsc -p packages/figma-mcp-server/tsconfig.json --noEmit` 零错误
- [x] 4.5 mock backend 抽到 `tests/v2/helpers/mock-backend.ts`，并按真模板重建：`标题 › 序号 › 交互说明标记 › Base + Number`、双槽位段、`说明块02` 不带 `配图`
- [x] 4.6 修 mock 自身失真：`nodeInfo()` 未返回 `characters`，导致 `decideRoleKeepDelete` 看到的角色标签全是空串、7 个全被删。角色保留逻辑此前从未被真正测过

## 5. 验证与收尾

- [x] 5.1 端到端：含 3 个 `####` 的文档渲染进真模板，产出单个说明块内 3 段槽位，编号/主标题各一份，角色标签只在首段，`配图` 只在声明它的那段
- [x] 5.2 端到端：不含 `####` 的文档渲染结果正确，`#Title` 占位与多余槽位全部清除
- [x] 5.3 已核对 `markdown-v2-spec.md:66-68` 的 G1/G2/G3 与 `:81` 的 W5，错误码、触发条件、宽度阈值均与实现一致，无需修订
- [x] 5.4 删除 `reference/` 素材目录。engine 快照仍可从 commit `4406ee7` 的树中取回
- [x] 5.5 按真模板重写 `template-map.ts` 的 `说明块` 结构注释与 `figma-template-1-14-rendering` spec —— 过时的注释正是本次返工的根源
