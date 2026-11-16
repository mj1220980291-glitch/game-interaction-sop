## ADDED Requirements

### Requirement: 能力取值到行为 SHALL 有唯一映射表

引擎 SHALL 提供单一模块，对 8 项模板能力的每个取值声明三类规则：markdown 写法要求（`md`）、书写契约文案（`contract`）、渲染期行为开关（`render`）。解析、契约生成、渲染、编译与对账 SHALL 读取该表，SHALL NOT 在各模块内用独立分支重新解释同一能力取值。

#### Scenario: 新增能力取值
- **WHEN** 能力枚举新增一个取值但未补映射表
- **THEN** 类型检查 SHALL 失败并指出缺失的键，SHALL NOT 静默回落到默认行为

#### Scenario: 消费点重复判定
- **WHEN** 某消费点需要判断「该能力取值是否要求某写法」
- **THEN** 该判断 SHALL 来自映射表字段，SHALL NOT 出现 `=== '<value>'` 之类的新分支

### Requirement: 解析闸门 SHALL 由能力表推导

`parseV2` SHALL 依据映射表的 `md` 规则决定总览、职能行、簇内分组与配图条目是否必需。`roleAnnotation = none` 时 `@角色` 行 SHALL 可选：不写不报错，写了只产生软警告；`component-variant` 时 SHALL 必需。

#### Scenario: roleAnnotation=none 不写角色行
- **WHEN** 模板 `roleAnnotation = none`，md 的簇首行直接是条目
- **THEN** 解析 SHALL 成功，SHALL NOT 报 `V2_C2_ROLE_LINE_MISSING`

#### Scenario: component-variant 缺角色行
- **WHEN** 模板 `roleAnnotation = component-variant`，簇首行不是 `@角色`
- **THEN** 解析 SHALL 报 `V2_C2_ROLE_LINE_MISSING`

### Requirement: 契约文本 SHALL 由同一张表生成

`mdContract` 的每一节（顶部/章节/簇/分组/配图/标号/职能/总览/禁写清单）SHALL 从映射表生成，SHALL NOT 与解析闸门或渲染行为给出相反指引。

#### Scenario: 契约与解析一致
- **WHEN** 某能力取值使角色行可选
- **THEN** 契约文本 SHALL 与之相符（允许不写或写成句尾），SHALL NOT 出现「不写 `@职能`」却又被解析器强制要求的组合

### Requirement: 一致性 SHALL 可在加载期自检

模板包加载与 `audit_template_pack` SHALL 依据映射表比对「能力取值 → 允许写法 → 实际契约/闸门」，不一致时 SHALL 产出软警告 `V2_W_CAPABILITY_CONTRACT_MISMATCH`，SHALL NOT 中止渲染或自动修改模板。

#### Scenario: 映射与实现不一致
- **WHEN** 映射表声明某取值允许某写法，但解析器仍拒绝
- **THEN** 自检 SHALL 报出一条带能力项、取值、期望与实际的警告

### Requirement: 表 SHALL 由遍历式测试覆盖

测试 SHALL 遍历能力项与全部取值，自动断言「契约文本 ⟺ 解析闸门 ⟺ 渲染行为」三者一致；新增取值 SHALL 自动纳入该测试，SHALL NOT 依赖人工补写用例。

#### Scenario: 表驱动覆盖
- **WHEN** 运行全量测试
- **THEN** 每个能力的每个取值 SHALL 至少被一条一致性断言覆盖，并输出覆盖清单
