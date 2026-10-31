## ADDED Requirements

### Requirement: 同步填图的行内视觉归一化

同步的 `fills` 批次替换配图时，目标矩形 SHALL 同时清空 `strokes` 与 `dashPattern`，与渲染侧填图规则一致。

同步 SHALL NOT 清理非本批次写入的矩形描边（人工添加的边框须保留）。

#### Scenario: 同步替换配图

- **WHEN** md 的配图描述不变、`assetMap` 换了图，同步重填该槽
- **THEN** 该矩形 SHALL 有 IMAGE 填充且无描边、无虚线

#### Scenario: 人工边框保留

- **WHEN** 某配图槽的图未被同步改动，但人工给该矩形加了描边
- **THEN** 同步 SHALL 保留该描边
