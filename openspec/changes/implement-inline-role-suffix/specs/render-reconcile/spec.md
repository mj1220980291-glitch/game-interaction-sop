## ADDED Requirements

### Requirement: 同步 SHALL 按带句尾职能的文本比对

模板包 `roleAnnotation = 'inline-suffix'` 时，`planReconcile` SHALL 以 `inlineRoles: true` 调用 `expectedItems`，使「计划侧期望文本」与「渲染写入的文本」完全一致。

未开启该开关时 SHALL 保持原行为（正文不带句尾职能）。

#### Scenario: 幂等

- **WHEN** 对已渲染的蛋仔文档、markdown 未变执行同步
- **THEN** `changes` SHALL 为空

#### Scenario: 改一条正文

- **WHEN** markdown 改写首条正文的文字（职能不变）
- **THEN** 同步 SHALL 更新那一条，更新后的文本 SHALL 仍以 ` @GUI @程序` 结尾
