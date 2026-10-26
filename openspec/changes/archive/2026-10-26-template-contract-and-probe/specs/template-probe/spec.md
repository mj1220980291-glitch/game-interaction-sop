## ADDED Requirements

### Requirement: 探针只读

探针 SHALL 只读取目标文件，SHALL NOT 调用任何写入类后端方法（克隆、删除、改文字、改样式、打 plugin data、改页面结构）。

探针执行前后，目标文件的节点树 SHALL 保持一致。

#### Scenario: 零写入
- **WHEN** 对任意模板执行 `figma_probe_template`
- **THEN** fake backend SHALL 记录到零次写入方法调用，且目标文件节点树前后一致

#### Scenario: 探针失败也不留痕
- **WHEN** 探针在扫描中途抛错
- **THEN** 目标文件 SHALL 与执行前一致，SHALL NOT 产生任何中间节点

### Requirement: 探针输入与扫描内容

探针 SHALL 接受 `fileKey`（可选，缺省当前连接文件）与 `nodeId`（模板根，必填），并 SHALL 按下列顺序扫描：

1. 结构规约（类型 / 名称 / 尺寸量级 / 是否隐藏 / 子节点数，不含文本内容）
2. 顶部区与元信息项
3. 章节单元（图片容器 + 说明容器）
4. 簇单元（编号 + 标题 + 内容行）
5. 母版（重复单元或隐藏同形单元）
6. 8 项能力
7. 结构指纹

`nodeId` 不存在或不可访问时 SHALL 返回明确错误，SHALL NOT 猜测替代节点。

#### Scenario: 节点不存在
- **WHEN** 传入的 `nodeId` 在目标文件中不存在
- **THEN** 探针 SHALL 返回错误码并指明该 id，且不输出任何能力判定

### Requirement: 三态结论

探针 SHALL 输出且仅输出一个结论，三者互斥：

| verdict | 条件 |
|---|---|
| `ready` | 铁律全通过，且母版与 4 部件的定位全部来自实测 |
| `needs-anchor` | 铁律全通过，但至少一处母版或锚点只能靠推断 / 需要补锚点 |
| `non-conformant` | 任一铁律不通过 |

`non-conformant` 时 SHALL NOT 输出能力判定与草案。

#### Scenario: 可接的项目
- **WHEN** 对满足全部铁律、且章节母版与簇母版都能实测定位的模板执行探针
- **THEN** `verdict` SHALL 为 `ready`，`gaps` SHALL 为空数组

#### Scenario: 铁律不满足
- **WHEN** 模板的说明容器内没有任何簇单元
- **THEN** `verdict` SHALL 为 `non-conformant`，并指明失败的铁律 ID

### Requirement: 来源标记

探针输出的每一项判定 SHALL 带 `source`，取值只能是：

- `probed`：从节点结构实测得出
- `inferred`：启发式推断得出
- `default`：未能判定，按契约缺省值落下

`inferred` 与 `default` 的项 SHALL 在报告 `gaps` 中列明并给出建议动作。

#### Scenario: 推断项必须显式列出
- **WHEN** 探针无法确认配图槽的判据，只能按缺省 `named-group` 落下
- **THEN** 该能力项的 `source` SHALL 为 `default`，且 `gaps` SHALL 包含一条对应说明

### Requirement: 报告与草案

探针 SHALL 返回机器可读结果，至少含：`verdict`、`rules`（逐条铁律结果）、`masters`（章节 / 簇母版位置与形态）、`capabilities`（含 `source`）、`gaps`、`draft`（`template.json` 草案）、`fingerprint`。

`draft.components` 在编译完成前 SHALL 为 `null` 并附说明，SHALL NOT 编造 key。

探针 SHALL 同时提供人读版报告，逐条列出铁律结果、母版位置、能力清单与缺口建议。

#### Scenario: 草案不含编造 key
- **WHEN** 探针在编译之前执行
- **THEN** `draft.components` 的 4 个字段 SHALL 均为 `null`，且说明文字指出「编译并发布后填入」

#### Scenario: 同一模板结论稳定
- **WHEN** 对同一模板连续执行两次探针
- **THEN** `verdict`、`capabilities`、`masters`、`fingerprint` SHALL 完全一致

### Requirement: 探针不修改项目原模板

探针 SHALL NOT 要求项目方改名、补节点、加母版。缺口只作为 `gaps` 报告，处置由人在后续编译变更中决定。

#### Scenario: 缺锚点只报告
- **WHEN** 模板的簇标题没有稳定可判据，探针只能靠位置推断
- **THEN** 报告 SHALL 给出 `needs-anchor` 与建议动作，SHALL NOT 修改该节点
