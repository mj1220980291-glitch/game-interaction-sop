## ADDED Requirements

### Requirement: 需求概述段 SHALL 支持

文档 MAY 包含一个 `## 需求概述` 段，其下由若干 `### 小标题` + 正文段落组成。该段 SHALL 与 `## 设计总览` 相互独立（可并存，也可都不写）；缺失时解析 SHALL 成功。

#### Scenario: 多个小标题
- **WHEN** `## 需求概述` 下有两个 `### 小标题`，各有正文
- **THEN** 解析 SHALL 产出两项概述条目（标题 + 正文），并按出现顺序排列

#### Scenario: 无该段
- **WHEN** 文档没有 `## 需求概述`
- **THEN** 解析 SHALL 成功，概括项为空数组，且 SHALL NOT 报错

### Requirement: 修订记录段 SHALL 用 Markdown 表格

文档 MAY 包含一个 `## 修订记录` 段，其后 SHALL 为一个 Markdown 表格，表头 SHALL 含且仅含四列：`修订日期`、`修订人`、`修订内容`、`修订原因`（顺序可任意）。缺列或出现未知名列 SHALL 报硬错误。

#### Scenario: 三行修订
- **WHEN** 表格有一行表头与三行数据
- **THEN** 解析 SHALL 产出三条修订记录，每条含四个字段

#### Scenario: 缺列
- **WHEN** 表格只有 `修订日期` / `修订人` / `修订内容` 三列
- **THEN** 解析 SHALL 失败，错误信息 SHALL 指出缺少 `修订原因`

### Requirement: 审核情况段 SHALL 用键值行

文档 MAY 包含一个 `## 审核情况` 段，其内容 SHALL 为若干 `键名：值` 行（中文或英文冒号）。键名的槽位映射由模板结构声明提供；未在声明中出现的键 SHALL 记软警告并忽略。

#### Scenario: 键值齐全
- **WHEN** 段内有 `审核人：张三` 与 `UI：李四` 两行，声明中两者都映射到槽位
- **THEN** 解析 SHALL 产出两个键值对，渲染 SHALL 分别写入对应槽位

#### Scenario: 未知键
- **WHEN** 段内出现 `后端：王五` 而声明里没有该键
- **THEN** 解析 SHALL 成功，并 emit 软警告说明该键无对应槽位
