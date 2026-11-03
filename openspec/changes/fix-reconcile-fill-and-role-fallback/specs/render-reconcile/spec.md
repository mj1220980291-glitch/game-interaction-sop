## ADDED Requirements

### Requirement: 配图槽形态 SHALL 按节点类型判定

填图目标 SHALL 依据节点类型决定：`RECTANGLE` 视为裸槽（自身即填图目标），`GROUP` / `FRAME` 视为容器（填图目标为内部 `配图占位` 矩形）。结构档案（`figureSlot`）SHALL 只在节点类型未知时兜底。

SHALL NOT 对 `GROUP` 赋值 `fills`——Figma 对组没有 `fills` 属性，赋值会抛 `TypeError: object is not extensible`，且同步与退化两条路会死在同一个节点上。

槽级填图失败时，message SHALL 带步骤标签（`getGroup` / `getRect` / `export` / `setFills` / …）与目标节点类型，便于定位。

#### Scenario: named-group 模板的槽被当成容器

- **WHEN** 文档结构档案是 parts（`figureSlot: rect`），但配图条目节点实际是 `GROUP`
- **THEN** 填图 SHALL 下沉到组内 `配图占位` 矩形，SHALL NOT 往 GROUP 上写 `fills`

#### Scenario: 单层矩形槽

- **WHEN** 配图条目节点本身是 `RECTANGLE`
- **THEN** 填图 SHALL 直接写它自己的 `fills`

### Requirement: 配图填图失败 SHALL 退化为可用结果

reconcile 的槽级填图（resize 组、删占位文案、清描边）失败时，引擎 SHALL 退化为「只把源图刷进 `配图占位` 矩形」，SHALL NOT 让整张图丢失。

退化 SHALL 发 `V2_W_FIGURE_FILL_FALLBACK`，message SHALL 含原错误原文与条目路径；退化也失败时才发 `V2_W_FIGURE_FILL_FAILED`。

#### Scenario: 已有文档补图

- **WHEN** 对已渲染文档同步，`assetMap` 给某簇第 K 张配图提供 `figma_node`，槽级填图抛错
- **THEN** 该矩形 SHALL 有图片填充，`warnings` SHALL 含 `V2_W_FIGURE_FILL_FALLBACK`，SHALL NOT 出现该条目丢失

#### Scenario: 退化也失败

- **WHEN** 槽级填图与退化路径都抛错（源节点不存在）
- **THEN** `warnings` SHALL 含 `V2_W_FIGURE_FILL_FAILED`，渲染仍 SHALL 完成

### Requirement: 删除带图配图槽 SHALL 告警

配图槽一旦被删除，像素就不再可恢复（标记里只有 `imageHash`）。因此计划阶段删除带图（`imageHash` 非空）的配图条目时，SHALL 发 `V2_W_FIGURE_IMAGE_LOST`，message SHALL 含条目文本与 imageHash 前缀，并提示「markdown 里加回来时要一并给 assetMap」。

同时，若插入配图槽时发现旧标记里记过 `imageHash` 且本次没有对应 `assetMap` 键，SHALL 再发一次同样的告警。

`Plan` SHALL 携带 `warnings`，同步结果 SHALL 与解析 / 快照告警合并返回。

#### Scenario: 删掉带图的配图条目

- **WHEN** md 删掉一条已贴图的 `配图：` 并同步
- **THEN** `changes` SHALL 含该条 delete，`warnings` SHALL 含 `V2_W_FIGURE_IMAGE_LOST` 指向它

#### Scenario: 删图再恢复

- **WHEN** md 删掉一条 `配图：` 同步后，又把它加回来同步，且没给 assetMap
- **THEN** 同步 SHALL 完成，新槽 SHALL 是空占位，`warnings` SHALL 至少有一条 `V2_W_FIGURE_IMAGE_LOST`（删除时已发；有留痕时恢复时再发）
