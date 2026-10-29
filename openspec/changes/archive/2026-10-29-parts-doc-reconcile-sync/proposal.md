## Why

多部件渲染（顶部 / 章节 / 簇 / 结尾四块拼装）是现在所有带模板包的项目走的路径，但它渲染出来的文档**不带 stamp**，于是 `target.rootId` 一律被 `V2_NOT_STAMPED` 拒绝——设计师改了一句想同步回去，只能整篇重渲染，手改全丢。链路 A 的端到端验收就在这里断掉：同一套「手改保留 / 只改变化 / conflicts」逻辑在旧 1:14 路径上实测通过，在 parts 文档上根本进不去。

## What Changes

- parts 渲染结束时给文档打 stamp：`doc` 标记记录 `structure: 'parts'` 与部件指纹（四个部件 key + capabilities 摘要），章节 / 簇 / 条目 / 槽位照旧打 `section` / `cluster` / `item` / `slot`
- stamp 的槽位角色表按结构分派：旧路径沿用 `1:14` 图层名，parts 路径用 `CHAPTER_SLOTS` / `CLUSTER_SLOTS` / `TOP_SLOTS` 的统一名（`左列` / `舞台` / `气泡` / `配图` / `正文/规则` / `#Title_Main`）
- 快照与规划器按 `doc.structure` 选结构档案（`StructureProfile`），不再硬编码 `1:14` 的 `说明块NN` / `rec组`
- 同步需要新节点时，scratch 文档按同一结构渲染：parts 文档用 parts 管线重建，**不**克隆 `1:14`
- 同步后重算 parts 专有的几何：章节高度、左列拉伸、标号网格位置
- 部件的 key 或 capabilities 与标记里记录的不一致时返回 `V2_PACK_MISMATCH`，要求重渲染，不做半猜的原地改
- 未打标的旧 parts 文档仍是 `V2_NOT_STAMPED`（不实现 adopt：parts 文档可一键重出，adopt 收益低、风险高）

## Capabilities

### New Capabilities
- `render-reconcile-parts`: 多部件文档的原位同步——打标规则、结构档案分派、槽位角色映射、parts scratch 重建、同步后几何重算、部件指纹校验

### Modified Capabilities
- `render-reconcile`: 入口从「只认 1:14 打标文档」改为「按 `doc.structure` 分派结构档案」；`V2_NOT_STAMPED` 与锁、幂等、scope、dryRun 的语义不变

## Impact

- `src/v2/render/parts/index.ts`：渲染结束时打标（新增 `stampPartsDoc` 调用），返回 `stamps` 供同步复用
- `src/v2/render.ts`：`loadPartsPack() !== undefined` 不再跳过打标；`RenderResult` 增 `structure`
- `src/v2/reconcile/stamp.ts`：`DocStamp` 增 `structure` 与 `parts` 指纹字段
- `src/v2/reconcile/snapshot.ts`、`plan.ts`、`layout.ts`：结构相关的名字与层级改由 `StructureProfile` 提供
- `src/v2/reconcile/index.ts`：`renderScratch` 按结构分派；scratch 解析器支持 parts 布局
- `tests/v2/`：新增 parts 同步用例（手改保留 / 只改变化 / 新增簇走 scratch / 指纹不匹配）
- 数据兼容：已存在的 legacy 文档 `structure` 缺省视为 `legacy`，行为不变
