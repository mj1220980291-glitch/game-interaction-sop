## ADDED Requirements

### Requirement: 章节命名必须指向关键界面或在全局规范白名单内

每个 `## NN. [章节名]` 的章节名 SHALL 满足下列任一条件，否则 parser MUST 报 `H_SECTION_NOT_INTERFACE` 硬错误并拒绝解析：

a. 章节名含下列任一界面关键词：`界面`、`面板`、`页`、`窗`、`卡`、`弹窗`、`弹层`、`区`、`条`、`栏`、`区域`、`版`、`入口`、`反馈`
b. 章节名命中下列任一全局规范白名单关键词：`全局`、`规范`、`组件`、`汇总`、`流程`、`结算`

错误信息 MUST 列出当前合法关键词清单 + 修正建议。

#### Scenario: 章节名含界面关键词通过校验

- **WHEN** markdown 含 `## 01. 部从选中与入口` 章节
- **THEN** parser 通过该章节，不报 `H_SECTION_NOT_INTERFACE`

#### Scenario: 章节名命中全局规范白名单通过校验

- **WHEN** markdown 含 `## 02. 全局动效规范` 章节
- **THEN** parser 通过该章节，不报 `H_SECTION_NOT_INTERFACE`

#### Scenario: 章节名既无界面关键词也不在白名单则报错

- **WHEN** markdown 含 `## 01. 准备环节` 章节
- **THEN** parser 报 `H_SECTION_NOT_INTERFACE`，错误信息提示 "章节名应含界面关键词（界面/面板/...）或属于全局规范白名单（全局/规范/...）"

### Requirement: 簇与子分类命名应为界面信息块或行为单元，避免规则属性后缀

`### 簇名` 与 `#### 子分类名` SHALL 倾向使用名词性的界面信息块名（如"基础信息"、"属性概览"、"出售按钮"）或行为单元短语（如"hover 行为"、"折叠流程"）。当簇名/子分类名以下列任一后缀结尾时，parser MUST emit 软警告 `W_CLUSTER_NAME_LOOKS_RULE`，不阻塞解析：

禁词后缀：`时机`、`规则`、`层级`、`限制`、`边界`、`兼容`、`表现`

警告信息 MUST 提示作者可能的替代命名风格（"考虑改成 xxx 区 / xxx 按钮 / xxx 行为"）。

#### Scenario: 簇名以禁词后缀结尾触发警告

- **WHEN** markdown 含 `### 展开 / 收起时机` 簇（以 `时机` 结尾）
- **THEN** parser 返回 `ok: true`，warnings 包含 `W_CLUSTER_NAME_LOOKS_RULE`，提示"考虑改成名词性命名（如'展开收起行为'/'展开收起按钮'）"

#### Scenario: 子分类名以禁词后缀结尾同样触发警告

- **WHEN** markdown 含 `#### 视觉层级` 子分类（以 `层级` 结尾）
- **THEN** parser 返回 `ok: true`，warnings 包含 `W_CLUSTER_NAME_LOOKS_RULE`

#### Scenario: 名词性命名不触发警告

- **WHEN** markdown 含 `### 锁定天书按钮` 簇
- **THEN** parser 不 emit `W_CLUSTER_NAME_LOOKS_RULE`

### Requirement: 死分类禁词列表

`### 簇名` 与 `#### 子分类名` SHALL NOT 命名为下列死分类词或以其结尾，parser MUST emit 软警告 `W_CLUSTER_NAME_DEAD_CATEGORY`，不阻塞解析：

死分类禁词：`显示规则`、`操作规则`、`反馈表现`、`异常与边界`

警告信息 MUST 解释"死分类把多个功能的同类规则拍平到一起，与'按界面信息块分类'原则相违"。

#### Scenario: 死分类名触发警告

- **WHEN** markdown 含 `### 显示规则` 簇
- **THEN** parser 返回 `ok: true`，warnings 包含 `W_CLUSTER_NAME_DEAD_CATEGORY`

#### Scenario: 死分类后缀触发警告

- **WHEN** markdown 含 `### 卡片操作规则` 簇（以 `操作规则` 结尾）
- **THEN** parser 返回 `ok: true`，warnings 包含 `W_CLUSTER_NAME_DEAD_CATEGORY`

#### Scenario: 仅含死分类关键字之一不触发警告

- **WHEN** markdown 含 `### 显示位置与隐藏` 簇（含"显示"但不是"显示规则"完整词）
- **THEN** parser 不 emit `W_CLUSTER_NAME_DEAD_CATEGORY`

### Requirement: 多态拆分指南

当一个需求涉及同一功能的多种界面态（例：hover 前 / hover 后；普通 / 选中；默认 / 锁定）时，作者 SHOULD 按下列规则决定拆 1 个还是 N 个章节：

a. 两态之间**功能模块差异 ≥ 2-3 个**（新增/移除/重命名的可识别信息块）→ 拆 N 个章节，每态对应 1 个章节
b. 否则 → 合 1 个章节，态差异通过簇/子分类/对比图表达

本规则为指引性条款，不引入新强校验或软警告。Parser MAY 在未来版本基于章节内"态对比"标记做启发式辅助校验。

#### Scenario: 大量态差异时拆章节

- **WHEN** 需求涉及"战场天书暗灰条态 (1 个元素)"与"战场天书展开态 (顶部信息条 + 5 张卡 + 锁按钮 + 使君形象 = 4 个新模块)"
- **THEN** 作者按指南拆成 2 个章节（差异 4 ≥ 2-3）

#### Scenario: 少量态差异时合章节

- **WHEN** 需求涉及"按钮默认态"与"按钮按下态"（仅视觉差异，无模块新增）
- **THEN** 作者按指南合成 1 个章节，用簇内规则描述两态差异
