## ADDED Requirements

### Requirement: 模板结构 SHALL 由 pack 声明描述

pack SHALL 通过 `layout.blocks` 声明文档结构：每个 block SHALL 声明稳定 `id`、所用部件（`part`）、循环来源（`repeat`）、槽位映射（`slots` / `list` / `table`）、角色组件形态（`roles`）与标号形态（`badge`）。声明 SHALL 只描述结构与槽位，SHALL NOT 描述样式或几何。

#### Scenario: 声明完整
- **WHEN** pack 含 `schema_version: 2` 与 `layout.blocks`
- **THEN** 加载 SHALL 成功，且渲染、同步、契约文案 SHALL 全部以该声明为准

#### Scenario: 声明缺字段
- **WHEN** 某个 block 既没有 `slots` 也没有 `list` / `table` / `roles` / `badge`
- **THEN** 加载 SHALL 报硬错误，指出 block id 与缺失的字段类别

### Requirement: 声明 SHALL 是唯一运行时路径

渲染、同步对账与契约文案生成 SHALL 读取声明；SHALL NOT 保留「按写死槽位名查找」的第二条运行路径。无声明的老 pack SHALL 由默认声明生成器生成等价声明后走同一路径。

#### Scenario: 老 pack 无声明
- **WHEN** pack 为 `schema_version: 1`（无 `layout`）
- **THEN** 引擎 SHALL 用默认声明生成器生成声明，并 SHALL NOT 走另一套渲染逻辑

#### Scenario: 有/无声明等价
- **WHEN** 同一 pack 分别「带显式声明」与「由生成器生成声明」渲染同一份 md
- **THEN** 两棵产物树的节点名、文字、结构与位置 SHALL 逐节点一致

### Requirement: 默认声明生成器 SHALL 以能力表为输入

无声明 pack 的默认声明 SHALL 由 8 项能力取值推导（`overview` / `clusterGroups` / `badgeSlot` / `numberBadge` / `roleAnnotation` / `figure` / `hiddenPool` / `column`）。渲染期 SHALL NOT 直接读取能力枚举。

#### Scenario: 逐项推导
- **WHEN** pack 声明 `roleAnnotation = component-variant`
- **THEN** 生成的声明 SHALL 含 `roles` 段（`职能标记=` 前缀、`文本` 标签槽、三类变体 key），且渲染 SHALL 只依据该段工作

### Requirement: 声明 SHALL 在编译期生成并经人工确认

`figma_compile_template(phase=compile)` SHALL 在收编 / 空壳化 / 归一化之后生成声明草案并写回 pack；草案 SHALL 带 `draft: true`。声明中的槽位 SHALL 在部件中存在，缺失时 SHALL 记 gap；导致渲染必失败的声明 SHALL 使 `phase=verify` 失败。

#### Scenario: 生成草案
- **WHEN** 编译一个含「跟进人 / 修订记录 / 审核 / 需求概述」块的源模板
- **THEN** 生成的 pack SHALL 含对应 block（带 `draft: true`），且每个 block 的槽位 SHALL 指向真实存在的节点

#### Scenario: 声明指向不存在的节点
- **WHEN** 声明中某槽位的 `name` 在部件里找不到
- **THEN** 编译 SHALL 记 gap（含 block id 与槽位名），SHALL NOT 静默忽略

### Requirement: 角色与标号形态 SHALL 由声明决定

角色标签 SHALL 由声明的 `roles.variants`（角色 → 变体 key）与 `roles.labelSlot` 决定；标号 SHALL 由 `badge.mode` 决定（`container` 克隆母版 / `instance` 改实例内数字 / `none` 不生成）。引擎 SHALL NOT 内置对 `职能标记=` 前缀或 `气泡` 容器的假设。

#### Scenario: 非默认角色组件集
- **WHEN** 声明 `roles.componentSetKey` 指向 `职位=GUI注意` 组件集，且 `variants` 把 `GUI` 映射到该组件集的变体 key
- **THEN** 渲染 SHALL 实例化该变体，SHALL NOT 使用 `职能标记=` 组件

#### Scenario: 序号实例形态
- **WHEN** 声明 `badge.mode = instance` 且给出实例内数字槽位
- **THEN** 渲染 SHALL 复用标题行里的序号实例并只改数字，SHALL NOT 克隆标号母版

### Requirement: 新增顶部块 SHALL 可由 md 提供数据

声明中类型为 `list`（来源 `overview`）与 `table`（修订记录）的块 SHALL 从 md 新增段读取数据并按行序填充；数据缺失时 SHALL 隐藏该块（见 markdown-v2-contract）。

#### Scenario: 修订记录多行
- **WHEN** md 的 `## 修订记录` 表格有 3 行数据，模板行模板只有 1 行
- **THEN** 渲染 SHALL 克隆行到 3 行，并按表头列名映射到声明中的列槽位

#### Scenario: 无数据
- **WHEN** md 没有 `## 需求概述` 段
- **THEN** 对应块 SHALL 隐藏，SHALL NOT 在产物里留下模板占位文案

### Requirement: 告警 SHALL 有单一来源

声明相关的校验 SHALL 统一产出 `V2_W_TEMPLATE_LAYOUT_*` 组（`SLOT_MISSING` / `IDENTITY_AMBIGUOUS` / `BLOCK_HIDDEN` 等）；旧的 `V2_W_HEADER_SLOT_MISSING` 等 SHALL 作为同一判定的兼容别名，SHALL NOT 存在第二个判定点。

#### Scenario: 槽位缺失
- **WHEN** 渲染期发现声明的槽位在实例中不存在
- **THEN** SHALL 只发一条 `V2_W_TEMPLATE_LAYOUT_SLOT_MISSING`（带 block id、槽位名），SHALL NOT 同时再发旧的 header 级告警
