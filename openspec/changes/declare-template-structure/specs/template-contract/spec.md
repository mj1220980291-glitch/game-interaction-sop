## MODIFIED Requirements

### Requirement: 模板包 SHALL 支持结构声明

`template.json` SHALL 支持 `schema_version: 2` 与可选 `layout.blocks`。字段语义：

- `schema_version: 1` 的 pack SHALL 继续可加载（由默认声明生成器补声明）
- 能力字段（`capabilities`）SHALL 保留，语义降级为「默认声明生成器的输入」
- `layout.blocks` 的存在 SHALL NOT 改变 `components` 的 key 语义

#### Scenario: v2 pack 加载
- **WHEN** pack 声明 `schema_version: 2` 且含 `layout.blocks`
- **THEN** 加载 SHALL 成功，且渲染 SHALL 只依据 `layout.blocks`

#### Scenario: v1 pack 加载
- **WHEN** pack 声明 `schema_version: 1`
- **THEN** 加载 SHALL 成功，引擎 SHALL 生成默认声明并给出一次「已按能力推导声明」的说明性日志

#### Scenario: 声明字段非法
- **WHEN** `layout.blocks[].part` 不是 `top|chapter|cluster|footer`，或 block `id` 重复
- **THEN** 加载 SHALL 失败并指出非法字段与位置

## ADDED Requirements

### Requirement: 编译 SHALL 写回结构声明

`figma_compile_template(phase=compile)` 产出的 pack SHALL 含 `layout.blocks`（草案带 `draft: true`）；人工确认后 SHALL 可去掉 `draft` 而不改其它字段。

#### Scenario: 产物带草案
- **WHEN** 编译完成并回填 key
- **THEN** 返回的 `templateJson` SHALL 含 `layout.blocks`，且每个槽位 SHALL 能在对应部件中找到
