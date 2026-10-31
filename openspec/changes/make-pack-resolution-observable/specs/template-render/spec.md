## ADDED Requirements

### Requirement: 模板解析可观测

渲染 SHALL 在返回值中暴露本次使用的模板解析结果，使调用方无需凭产物外观反推模板身份。

命中模板包时，返回值 SHALL 包含 `pack`：`path`（绝对路径）、`origin`（`env` / `cwd` / `project` / `default`）、可选 `project`、`components`（`top` / `chapter` / `cluster` / `footer`）、`capabilities`。

未命中模板包时，返回值 SHALL 包含 `packMissing: true` 与 `packCandidates`（4 项候选路径，各带 `state` 与可选 `reason`）；`packCandidates` SHALL NOT 在命中时返回。

命中模板包但调用方仍传了 `template.fileKey` 或 `template.nodeId` 时，渲染 SHALL 返回软告警 `W_TEMPLATE_ARG_IGNORED`，说明该入参只影响 legacy 模板寻址、不影响模板包查找。

#### Scenario: 命中项目模板包

- **WHEN** `<cwd>/.interaction-sop/template.json` 存在且四个 key 齐
- **THEN** 返回值 `pack.origin` SHALL 为 `cwd`，`pack.path` SHALL 为该文件绝对路径，`pack.components` SHALL 与该文件一致

#### Scenario: 模板包缺失但可回落

- **WHEN** 未设 `$GISOP_TEMPLATE_PACK`，4 个候选路径均不存在
- **THEN** 渲染 SHALL 仍按 legacy 回落完成，返回值 SHALL 带 `packMissing: true` 与 4 项 `packCandidates`（全部 `missing`）

#### Scenario: 显式指定的路径无效

- **WHEN** `$GISOP_TEMPLATE_PACK` 指向一个 JSON 语法错误的文件
- **THEN** 渲染 SHALL 在建立任何画布节点前失败，错误码 SHALL 为 `V2_TEMPLATE_PACK_MISSING`，message SHALL 列出该路径与解析错误摘要

#### Scenario: pack 缺 key 时不得半套渲染

- **WHEN** 命中的包缺少 `cluster` key
- **THEN** 渲染 SHALL 视为未命中该包，`state` 为 `incomplete` 并记明缺 `cluster`；`$GISOP_TEMPLATE_PACK` 显式指定时 SHALL 以 `V2_TEMPLATE_PACK_MISSING` 失败

#### Scenario: template 入参被忽略时告警

- **WHEN** 模板包命中，且调用方传入 `template: { fileKey, nodeId }`
- **THEN** 渲染 SHALL 成功，`warnings` SHALL 含 `W_TEMPLATE_ARG_IGNORED`

### Requirement: 模板缺失的归因文案

当模板包未命中而落到 legacy 模板寻址时，`V2_TARGET_FILE_UNREACHABLE` 的 message SHALL 明确区分「目标文件」与「模板文件」：先说明模板包未命中（指向 `packCandidates`），再说明「在目标文件 `<fileKey>` 中查找 `<nodeId>` 属 legacy 回落、不能作为缺包的证据」，最后附原始错误。

不带 `target` 时的组件实例克隆失败（`cloneNode: source not found`）SHALL 采用同一归因开头，错误码 SHALL 为 `V2_TEMPLATE_PACK_MISSING`。

#### Scenario: 缺包引发的 legacy 探针失败

- **WHEN** 模板包未命中，且 `target.fileKey` 中不存在模板节点
- **THEN** 返回 SHALL 为 `V2_TARGET_FILE_UNREACHABLE`，message SHALL 同时含「模板包未命中」与目标文件 key，SHALL NOT 断言该文件是模板所在文件

#### Scenario: 不带 target 的克隆失败

- **WHEN** 模板包未命中且调用方未传 `target`
- **THEN** 返回错误码 SHALL 为 `V2_TEMPLATE_PACK_MISSING`，message SHALL 前置说明模板包未命中，SHALL 附原始 `cloneNode` 错误
