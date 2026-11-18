## ADDED Requirements

### Requirement: 解析期硬校验 SHALL 由模板能力决定

`parseV2` 的总览要求、角色行要求、簇内分组与配图条目限制 SHALL 由模板能力推导，SHALL NOT 硬编码单一模板形状（官方 1.14 的两段总览 + 簇首行角色）。当 `roleAnnotation` 为 `inline-suffix` 或 `none` 时，SHALL NOT 要求簇首行 `@角色`；当 `overview` 为 `single-block` 或 `none` 时，SHALL NOT 要求两段总览。

#### Scenario: 无总览区模板
- **WHEN** 模板 `overview = none`，md 未写 `## 设计总览`
- **THEN** 解析 SHALL 成功

#### Scenario: 单块总览模板
- **WHEN** 模板 `overview = single-block`，md 只写一段总览
- **THEN** 解析 SHALL 成功，SHALL NOT 因缺少第二段报错
