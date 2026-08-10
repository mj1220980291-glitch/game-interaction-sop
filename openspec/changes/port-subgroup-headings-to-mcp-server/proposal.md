## Why

`####` 子分组小标题是 skill 规范 `markdown-v2-spec.md:85-110` 明确教给用户的功能，也是 spec `figma-template-1-14-rendering` 里「簇内子分类小标题渲染」Requirement 的内容（含 5 个 Scenario）。两个相关 change 已归档：`2026-05-26-v2-add-cluster-subgroup-headings`、`2026-05-26-v2-render-subgroup-headings-deeply`。

**但实际运行的引擎从来没有实现过它。**

功能在 commit `867ae9a` 时被做进了 `packages/engine`——一个二代架构遗留的死包，零运行时引用。实际跑的 `packages/figma-mcp-server` 从未同步，链路上每一环都在丢弃这个信息：

- `parser.ts:430-444` — `stripH4` 默认 true，`####` 行被静默跳过，不产 `groups`，不报 G1/G2/G3 硬错误
- `render.ts:573-578` — 模板里所有 `#Title` 节点被无条件全部删除
- `render.ts:567` 注释自认：`The v2 IR currently has NO #### support`

用户按规范写了 `#### 基础信息 / #### 升级反馈`，跑完 Phase 4 得到的是两组 bullets 拍平进同一个说明块、小标题消失，且**不报错、不警告**。这是静默丢信息，比崩溃更难被发现。

`stripH4` 这个开关本身来自 `bee9539`，当时是为了防止字面量 `#### 基础信息` 泄漏进 Figma 文本节点——属于用「丢弃」掩盖「未实现」。

## What Changes

- `src/v2/ir.ts` 新增 `BulletGroup` 接口，`SemanticCluster` 增加 `groups: BulletGroup[]` 字段，新增 4 个错误码
- `src/v2/parser.ts` 实现 `parseClusterGroups()` + `displayWidth()`，产出 `groups[]`；实现 G1/G2/G3 硬校验与 W5 软警告；重新定义 `stripH4` 语义
- `src/v2/render.ts` 实现 `cloneClusterBlock()` / `insertSubgroupTitleText()` / `fillClusterGroups()`，替换掉「无条件删除所有 `#Title`」的逻辑
- 保留向后兼容快路径：单 group + null title 时渲染路径与现状完全一致
- 移植时适配三代优化（`batchCloneNodes` / `scanSubtree` / 已缓存的 `allDescendants`），不直接照搬 engine 的逐节点调用

移植素材见 `reference/`（engine 删除前的快照）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `markdown-v2-contract`：parser 必须产出 `groups[]` 并执行 `####` 相关校验
- `figma-template-1-14-rendering`：分组渲染从「已归档但未实现」变为真实实现

## Impact

- 代码：`packages/figma-mcp-server/src/v2/{ir,parser,render}.ts`
- 测试：`tests/v2/parser.spec.ts` 补 `####` 解析与校验用例；新增分组渲染测试覆盖 spec 的 5 个 Scenario
- 兼容性：不含 `####` 的既有文档渲染结果必须逐字节不变
- 前置：本 change 依赖 `reference/` 素材，该目录在 `packages/engine` 删除前建立
