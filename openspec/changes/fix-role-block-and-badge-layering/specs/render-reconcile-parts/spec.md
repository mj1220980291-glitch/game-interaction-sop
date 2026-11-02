## ADDED Requirements

### Requirement: 章节主图落图与统计口径

多部件渲染 SHALL 按「主图槽是否找到 + 资产是否实际落图」统计主图：调用了落图 API（`setImageFill` / `rasterizeNodeToImageFill` / `placeInstance`）的章节计入 `summary.imagesPlaced`，其余计入 `summary.placeholdersUsed`。

主图槽（`CHAPTER_SLOTS.mainImage`）在章节部件里找不到、且该章提供了主图资产时，渲染 SHALL 报 `V2_W_MAIN_SLOT_MISSING`（含章节名），SHALL NOT 只依赖打标阶段的 `V2_W_STAMP_LAYOUT_MISMATCH`。

`imagesPlaced + placeholdersUsed` SHALL 等于章节数。

#### Scenario: 主图实例落图计数

- **WHEN** 3 章文档，每章 `assetMap["NN"]` 均为 `figma_instance`
- **THEN** `summary.imagesPlaced = 3`、`summary.placeholdersUsed = 0`，且 SHALL NOT 报 `V2_W_MAIN_SLOT_MISSING`

#### Scenario: 主图槽缺失

- **WHEN** 某章节部件里没有名为 `主图` 的槽位，但该章传了主图资产
- **THEN** 该章计入 `placeholdersUsed`，并报一条 `V2_W_MAIN_SLOT_MISSING`（`context` 含章节名）

### Requirement: parts 路径的职能条目

多部件渲染 SHALL 复用渲染入口解析好的角色运行时填充 `@职能` 条目，行为与 legacy 路径一致：一个 bullet 一个角色，产出一个组件实例，正文写入实例内非标签 TEXT。

`roleAnnotation` 能力不为 `component-variant` 时，渲染 SHALL 继续删除簇内职能载体并按既有规则告警，SHALL NOT 因本次改动新增实例。

#### Scenario: parts 路径组件变体

- **WHEN** 模板包 `capabilities.roleAnnotation = component-variant`，md 某簇含 `- @策划：阈值见配表`
- **THEN** 簇内 SHALL 出现一个 `职能标记=#策划` 实例，正文为「阈值见配表」

#### Scenario: 非组件变体不受影响

- **WHEN** `roleAnnotation = inline-suffix`，md 含 `@策划`
- **THEN** 渲染 SHALL 仍按句尾写法处理，SHALL NOT 创建任何 `职能标记` 实例

### Requirement: 同步不重复插入职能条目

多部件文档走同步时，`@职能` 条目 SHALL NOT 被当作普通正文条目参与文本对齐：其载体是组件实例，打标阶段不按条目记录。

因此幂等同步（md 与画布一致）SHALL 返回 `changes: []`，SHALL NOT 为每个 `@职能` bullet 生成 `insert`。

该边界 SHALL 写入文档：同步模式不支持把普通正文改写成 `@职能` 实例，需要时整篇重渲。

#### Scenario: 幂等同步

- **WHEN** 文档含 2 个 `@职能` 实例，md 一字不改再同步
- **THEN** `changes` SHALL NOT 含任何 `@职能` 文本的 `insert`，这些实例 SHALL NOT 出现在 `preserved` 的 `foreign` 里

#### Scenario: 新增职能条目需重渲

- **WHEN** md 新增一条 `- @程序：…` 并对旧文档同步
- **THEN** 同步 SHALL NOT 自行插入组件实例（已知限制），报告需提示重渲或手工替换
