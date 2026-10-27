## ADDED Requirements

### Requirement: 槽位命名归一化

`compile` 阶段 SHALL 在嵌套收编之后、产物能力重算之前，把 4 个部件内的槽位节点改名为统一槽位名。

改名 SHALL 只作用于结构判定为槽位的节点，SHALL NOT 整树改名；已是统一名的节点 SHALL NOT 被改动（幂等）。

每个槽位 SHALL 只接受唯一候选；出现多个候选时 SHALL NOT 猜，记 `gaps` 并保留原名。

关键槽位任一无法定位时，编译 SHALL 拒绝（`V2_COMPILE_SLOT_UNMAPPED`）并指明部件与槽位名，SHALL NOT 产出不完整部件。

#### Scenario: 项目命名归一
- **WHEN** 章节母版是 `Group 2360`、簇母版是 `Frame 1245`
- **THEN** 编译产物中该章节标题节点名 SHALL 为 `#Name`，簇标题 SHALL 为 `#Title_Main`

#### Scenario: 重复编译幂等
- **WHEN** 对已归一化的项目再编一次
- **THEN** 产物中 SHALL NOT 出现任何额外的改名动作

#### Scenario: 关键槽位缺失
- **WHEN** 簇部件内定位不到内容行槽位
- **THEN** 编译 SHALL 失败并指明 `cluster.正文/规则`，SHALL NOT 生成可发布组件

### Requirement: 标号母版收口

编译 SHALL 在标号容器内保证恰好一个隐藏母版 `标号/母版`：源模板自带标号时保留一个改为母版并隐藏，其余删除；补容器场景下 SHALL 从 `1:14` 的标号形态克隆一份作为母版。

母版 SHALL 内含一个可写编号 TEXT `#Number`。

无法生成母版时编译 SHALL 记 `gaps`，并在 `capabilities` 中保持 `badgeSlot` 为可表达值（容器在但无母版时不得谎报可摆位）。

#### Scenario: 多标号收口
- **WHEN** 章节部件 `气泡` 内有 8 个 `标号/N`
- **THEN** 产物 SHALL 只保留 1 个隐藏 `标号/母版`，其余 SHALL 被删除

#### Scenario: 散落标号需要补母版
- **WHEN** 源模板标号是散落三角实例且提供了 `1:14` 气泡来源
- **THEN** 产物 `气泡` 内 SHALL 含一个隐藏 `标号/母版`，其 `#Number` 文本可写

### Requirement: md-contract 产出

`verify` 成功后 SHALL 产出 `md-contract.md` 正文与建议路径 `<项目根>/.interaction-sop/md-contract.md`，并把相对路径写入模板包 `mdContract` 字段。

正文 SHALL 由模板包（能力 + 槽位）推导，内容至少含：顶部字段、章节写法、簇写法、分组能否使用、配图写法、标号说明、职能写法、总览形态、禁写清单、最小骨架示例。

同一模板包重复生成，正文 SHALL 逐字节一致（不含时间戳等易变内容）。

正文落盘 SHALL 由调用方完成；工具 SHALL NOT 猜测项目根路径写文件。

#### Scenario: 契约与能力一致
- **WHEN** 模板包 `capabilities.clusterGroups = none`
- **THEN** 生成的契约「禁写清单」SHALL 含「不要使用 `####`」

#### Scenario: 可重复生成
- **WHEN** 对同一模板包连续生成两次
- **THEN** 两次正文 SHALL 完全相同
