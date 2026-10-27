## ADDED Requirements

### Requirement: 模板编译工具

引擎 MCP server SHALL 提供写入类工具 `figma_compile_template`，用于把项目模板编译成库文件里的 4 个原子组件并回填组件 key。

工具 SHALL 接受：`phase`（`compile` | `verify`，必填）、`source`（`{ fileKey?, nodeId }`，必填）、`library`（`{ fileKey, pageId? }`，必填）、`project`（必填）、`samples`（可选，0~3 个节点 id）、`parts`（可选，缺省四个部件全量）、`write`（可选，缺省 `false`）。

#### Scenario: 工具注册
- **WHEN** MCP server 启动
- **THEN** 工具列表中 SHALL 出现 `figma_compile_template`，且描述明确写出「会写入库文件，需 `write: true`」

#### Scenario: 缺必填参数
- **WHEN** 调用时未提供 `library.fileKey` 或 `source.nodeId`
- **THEN** 工具 SHALL 返回参数错误，SHALL NOT 退化为使用当前打开文件

#### Scenario: write 缺省为干跑
- **WHEN** 调用时未提供 `write`
- **THEN** 工具 SHALL 按干跑执行，SHALL NOT 写入任何节点

### Requirement: 写入前确认与撤销点

工具在 `write: true` 且 `phase: compile` 时 SHALL 先创建撤销检查点，再开始写入。

工具 SHALL NOT 在未获显式 `write: true` 的情况下写入库文件。

#### Scenario: 写入前有撤销点
- **WHEN** 以 `write: true` 执行 `compile`
- **THEN** 写入序列开始前 SHALL 已创建一次撤销检查点

### Requirement: verify 阶段只读库文件

`phase: verify` SHALL 只读库文件中的组件 key，SHALL NOT 修改任何画布节点。

`verify` 的输出 SHALL 用于回填 `<项目根>/.interaction-sop/template.json`。

#### Scenario: verify 不改画布
- **WHEN** 执行 `phase: verify`
- **THEN** 库文件的节点树 SHALL 与执行前一致
