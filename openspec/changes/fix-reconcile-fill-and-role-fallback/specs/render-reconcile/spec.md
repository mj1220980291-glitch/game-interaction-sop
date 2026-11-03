## ADDED Requirements

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
