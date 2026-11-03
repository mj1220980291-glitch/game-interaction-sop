## ADDED Requirements

### Requirement: 模板能力未实现时 SHALL 告警

模板包声明了引擎尚未实现的能力取值时，引擎 SHALL 产出软告警、说明被丢弃的数据，SHALL NOT 静默降级。

当前适用：`capabilities.roleAnnotation = 'inline-suffix'`（把职能拼进标题）。该能力下若某簇有 `@职能` 条目，渲染 SHALL 发 `V2_W_ROLE_ANNOTATION_UNSUPPORTED`，message SHALL 含章节序号、簇标题与被丢弃的职能列表。

#### Scenario: 蛋仔包渲染带职能的簇

- **WHEN** 模板包 `roleAnnotation: inline-suffix`，某簇 markdown 写了 `@GUI @程序`
- **THEN** 渲染 SHALL 完成，`warnings` SHALL 含 `V2_W_ROLE_ANNOTATION_UNSUPPORTED`，message SHALL 列出 `GUI` / `程序`

#### Scenario: 组件变体包不受影响

- **WHEN** 模板包 `roleAnnotation: component-variant`
- **THEN** SHALL NOT 产生该告警
