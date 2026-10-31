## Why

M1/M2 渲染 `ok:true`、`warnings:[]`，但产物需要手工补 4 类配图相关动作：删 27 个模板残留空 `配图` 框、给 27 个槽的占位文案层收尾、改 `配图占位` 图层名、清 6 条描边（描边归 `sanitize-inherited-style`）。其中「渲染声明了配图但 assetMap 没给」还完全静默——不报缺、不告警，图位空着也没人知道。

同步侧更模糊：md 里**新增或删除一条 `配图：` bullet** 时，引擎该建槽、该删槽还是该保留为 foreign，没有任何规范与实测结论。渲染和同步对同一件事各有一套隐含假设，是后续最可能出数据损坏的地方。

## What Changes

- 配图槽生命周期显式化：每个槽在渲染结束时必须落到「填图 / 保留占位（md 声明但缺图） / 隐藏（md 未声明）」三态之一，不留中间态
- md 声明了 `配图：` 而 `assetMap` 无对应项 → 软告警 `W_FIGURE_ASSET_MISSING`（逐条，带章节 / 簇 / key），槽保留占位灰板
- md 未声明的槽 → 整组隐藏（现状已有 `looseNodes` 逻辑，27 例说明覆盖不全，需复现定位），并 SHALL 保证组内占位文案一并不可见
- 置图成功后：槽内占位文案层删除；槽的配对依据从「占位文案文本」改为渲染期写的 pluginData（`gisop.asset.key` + 图 hash），文本仅作 legacy 回退——否则改名/删文案必然打断同步配对
- 图层命名：`配图占位` 矩形在置图后不改名（同步与契约按名称定位），改为在返回值与 stamp 中给出语义名映射，避免破坏既有判据
- 同步语义补齐：新增 `配图：` bullet → 复用隐藏槽或克隆新槽并填图；删除 `配图：` bullet → 槽整组删除（若槽内有手改则降级为冲突）；描述变更 → 更新配对与图，不动节点身份
- 新增软告警 `W_FIGURE_SLOT_ORPHAN`：同步时发现槽无法与任何 md 条目配对且非引擎创建

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `template-render`: 新增「配图槽三态与置图后收尾」要求
- `render-reconcile-parts`: 新增「配图条目增删的同步语义」要求

## Impact

- `packages/figma-mcp-server/src/v2/render/parts/index.ts`：`collectClusterLayout`（`:761-830`）的 `withImage` / `hintOf` 配对、`loose` 隐藏（`:688-694`）、置图后收尾
- `packages/figma-mcp-server/src/v2/render.ts`：legacy 路径 `fillImages`（`:1559-1650`）同规则对齐
- `packages/figma-mcp-server/src/v2/reconcile/plan.ts`：`figure()`（`:711-776`）增删分支
- `packages/figma-mcp-server/src/v2/reconcile/stamp.ts`：`ItemType` 的 figure 条目补 asset key
- 测试：`tests/v2/render-parts-*.spec.ts`、`tests/v2/reconcile-*.spec.ts` 新增；另需一份真机 fixture（M1 结构快照）覆盖 27 例场景
- 文档：`packages/skill/references/template-1-14.md` 补配图三态；`引擎问题反馈.md` P1-3/4/5、P2-11 标注对应 change
