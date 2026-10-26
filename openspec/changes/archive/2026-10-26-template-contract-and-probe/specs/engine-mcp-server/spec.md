## ADDED Requirements

### Requirement: 只读模板探针工具

引擎 MCP server SHALL 提供工具 `figma_probe_template`，用于在渲染前体检一个项目模板。

工具 SHALL 接受 `nodeId`（必填）与 `fileKey`（可选，缺省当前连接文件），SHALL 返回上节定义的探针结果结构。

工具 SHALL 被归类为只读工具：SHALL NOT 写入画布，SHALL NOT 要求任何确认提示。

#### Scenario: 工具注册
- **WHEN** MCP server 启动
- **THEN** 工具列表中 SHALL 出现 `figma_probe_template`，且其描述明确写出「只读，不修改文件」

#### Scenario: 缺参数
- **WHEN** 调用时未提供 `nodeId`
- **THEN** 工具 SHALL 返回参数错误，SHALL NOT 退化为扫描当前页

### Requirement: 探针结果可直接落盘

`figma_probe_template` 返回的 `draft` SHALL 是合法 `template.json` 的内容（`components` 为 `null` 占位），调用方 SHALL 能原样写入 `<项目根>/.interaction-sop/template.json` 而不需改写结构。

#### Scenario: 草案可解析
- **WHEN** 把 `draft` 原样写入 `template.json` 后再由引擎解析
- **THEN** 解析 SHALL 成功，能力项与探针输出逐字段一致
