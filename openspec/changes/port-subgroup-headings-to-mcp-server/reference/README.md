> **这是留档素材，不是活代码。** 三份 `.ts.txt` 是 `packages/engine/src/v2/` 在删除前的最后快照（commit `d16623f` 时点），保留用于本 change 的移植参考。

## 为什么留档

`packages/engine` 是二代架构（agent 手写胶水代码 import npm 包）的产物，继任失败后被冻结。但 `####` 子分组小标题功能在 commit `867ae9a` 时**误做在了 engine 里**，而实际运行的 `packages/figma-mcp-server` 从未同步。删包前把实现快照留下，避免移植时去翻 git 历史。

## 素材索引

| 文件 | 对应源 | 移植时看什么 |
|---|---|---|
| `engine-ir.ts.txt` | `packages/engine/src/v2/ir.ts` | `BulletGroup` 接口（L52-61）、`SemanticCluster.groups`（L80）、4 个错误码定义（L137+） |
| `engine-parser.ts.txt` | `packages/engine/src/v2/parser.ts` | `parseClusterGroups()`（L575-）、`displayWidth()`（L541-）、`GROUP_TITLE_MAX_ASCII`（L538）、`extractBullets()`（L704-） |
| `engine-render.ts.txt` | `packages/engine/src/v2/render.ts` | `cloneClusterBlock()`（L288-316）、`insertSubgroupTitleText()`（L362-）、`fillClusterGroups()`（L411-）、单 group 快路径（L691-696） |

## 关键实现点

### parser 侧

- `parseClusterGroups()` 分两阶段：先跳过 `@role` 行，再按 `####` 锚点切组
- `rawGroups[0]` 是隐式分组（title=null），`rawGroups[1..]` 是具名分组
- 校验：`H_H4_ORPHAN`（L460）、`H_GROUP_TITLE_LEN_OVERFLOW`（L655）、`H_GROUP_TITLE_DUPLICATE`（L666）、`W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS`（L627）
- `displayWidth()` 按显示宽度算长度，中文字符计 2，上限 `GROUP_TITLE_MAX_ASCII = 24`

### render 侧

- 向后兼容快路径：`groups.length === 1 && groups[0].title === null` 时走原扁平逻辑，**不调用任何新函数**（`engine-render.ts.txt` L691-696）
- `fillClusterGroups()` 里 group[0] 复用现有说明块，group[1..N] 各 clone 一个
- 角色标签 FRAME 只保留在 group[0]，其余整体删除
- 配图占位只保留在含 `配图：` bullet 的那个 group

## 移植注意

**不要直接拷贝。** `packages/figma-mcp-server/src/v2/` 有 engine 没有的三代优化，移植时必须适配：

- `batchCloneNodes`（`b99977a`）— engine 用的是逐个 `cloneNodeSafe`，移植后应走批量接口
- `scanSubtree`（`f1fabb5`）— engine 用多次 `getNodeInfo`，移植后应复用已缓存的 `allDescendants`
- mcp-server 的 `parseV2(markdown, opts?)` 带 `ParseClustersOpts`，engine 版没有；`stripH4` 开关需要在实现 groups 后重新定义语义

现存的 `stripH4`（`figma-mcp-server/src/v2/parser.ts:430-444`）是用「丢弃 `####` 行」掩盖「未实现分组」的补丁，移植时应当移除或改为仅在 groups 未启用时生效。
