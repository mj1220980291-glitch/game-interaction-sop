## MODIFIED Requirements

### Requirement: 对账标识 SHALL 由声明 id 决定

同步计划中的条目标识 SHALL 为 `blockId/slotId + 行序`，SHALL NOT 使用名字路径。老文档 stamp（名字路径）SHALL 通过归一化层映射到声明标识；映射不唯一时 SHALL 报 `V2_W_TEMPLATE_LAYOUT_IDENTITY_AMBIGUOUS` 并按「保留」处理，SHALL NOT 自动删除该死节点。

#### Scenario: 新文档同步
- **WHEN** 对声明化渲染产出的文档执行两次同步
- **THEN** 两次 SHALL 均为 `changes: []` / `conflicts: []`

#### Scenario: 老文档继续同步
- **WHEN** 老文档（stamp 为名字路径）在声明化后执行同步
- **THEN** 引擎 SHALL 归一化标识后完成对账，SHALL NOT 因标识变化产生批量误删

#### Scenario: 标识歧义
- **WHEN** 老 stamp 的名字在部件中出现多处
- **THEN** 该条目 SHALL 保留原状，并 emit 一条歧义警告（含名字与候选数量）

## ADDED Requirements

### Requirement: 声明驱动的条目顺序 SHALL 稳定

表格行、列表行与正文条目的对账顺序 SHALL 以声明中的槽位顺序 + 文档顺序为准；渲染与同步 SHALL 使用同一顺序来源。

#### Scenario: 表格行增删
- **WHEN** md 修订记录从 3 行改为 5 行
- **THEN** 同步 SHALL 只新增 2 行，SHALL NOT 重写已有 3 行
