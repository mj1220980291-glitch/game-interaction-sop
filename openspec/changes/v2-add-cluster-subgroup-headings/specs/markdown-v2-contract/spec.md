## ADDED Requirements

### Requirement: 文件头四行字段完整且顺序固定

v2 Markdown 文档 SHALL 在 `# [需求名称]` H1 与第一个 H2 之间，按以下**严格顺序**包含且仅包含 4 行元数据，每行格式为 `字段名：值`（中文冒号或英文冒号皆可）：

1. `跟进UI`
2. `需求组`
3. `易协作链接`
4. `最后更新时间`

任意一行缺失、顺序错误或包含额外行 SHALL 触发硬错误 `H1_HEADER_MISSING` 或 `H1_HEADER_ORDER_WRONG`。

#### Scenario: 四行齐全且顺序正确

- **WHEN** parser 读到 `# Demo\n\n跟进UI：a\n需求组：b\n易协作链接：c\n最后更新时间：2026.05.12`
- **THEN** parser SHALL 成功提取 `header = { title: 'Demo', owner: 'a', group: 'b', ticketLink: 'c', lastUpdate: '2026.05.12' }`，且不报错

#### Scenario: 缺一行触发硬错误

- **WHEN** parser 读到的文件头只有 3 行（如缺 `易协作链接`）
- **THEN** parser SHALL 返回 `ok: false`，且 `errors` 包含 `code: 'H1_HEADER_MISSING'`

### Requirement: 文档第一行必须是 H1 标题

文档 SHALL 以 `# [需求名称]` 作为第一个非空行；H1 全文档 SHALL 仅出现一次。

#### Scenario: 缺失 H1

- **WHEN** 文件以 `跟进UI：…` 开头，没有 `# 标题` 行
- **THEN** parser SHALL 报硬错误 `H2_TITLE_MISSING`

### Requirement: 设计总览段必须存在且仅含两个固定子段

文档 SHALL 包含恰好一个 `## 设计总览` 段；其下 SHALL 仅包含两个 H3 子段，按顺序为 `### 功能背景` 与 `### 核心交互`，缺一不可，多一不允。

#### Scenario: 设计总览缺失或子段错误

- **WHEN** 文档没有 `## 设计总览` 或其子段不是 `背景 + 交互`
- **THEN** parser SHALL 报 `O1_OVERVIEW_MISSING` 或 `O2_OVERVIEW_SUBSECTIONS_INVALID`

### Requirement: 章节序号连续从 01 开始

每个章节 SHALL 以 `## NN. [界面名称]` 形式声明，其中 NN 为 2 位零填充数字，从 `01` 开始，连续递增不跳号。

#### Scenario: 章节跳号

- **WHEN** 文档包含 `## 01.` 与 `## 03.` 但缺 `## 02.`
- **THEN** parser SHALL 报硬错误 `S2_SECTION_INDEX_NOT_CONTIGUOUS`

### Requirement: 每个章节至少包含一个语义簇且每个簇带角色行

每个 `## NN.` SHALL 至少包含一个 H3 `### [簇名]`；除"设计总览"两个固定子段外，每个 H3 簇 SHALL 在其下一行包含 `@角色1 @角色2 …` 行（至少 1 个 `@角色`，空格分隔）。

#### Scenario: 章节无簇

- **WHEN** `## 01.` 段下没有任何 `###`
- **THEN** parser SHALL 报 `C1_NO_CLUSTERS`

#### Scenario: 簇缺角色行

- **WHEN** `### 入口规则` 下一行不是 `@xxx` 而是空行 + bullets
- **THEN** parser SHALL 报 `C2_ROLE_LINE_MISSING`

### Requirement: 簇支持子分类小标题（####）

簇内 SHALL 允许 0 个或多个 `#### 子分类标题` 行作为分组锚点。

- 一个 `####` 之后的所有 bullets，直到下一个 `####`、`###` 或 `##`，归入该 `####` 命名的分组。
- `####` 之前出现的 bullets（"游离 bullets"）SHALL 归入隐式默认分组（title=null）；同时 parser SHALL emit 软警告 `W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS`，建议作者要么全分组、要么全不分。
- 完全没有 `####` 时，parser SHALL 自动包出 1 个 title=null 的默认分组，包含全部 bullets。

每个 `####` 标题文本 SHALL 不超过 12 个中文字（或 24 个 ASCII 字符）；同一簇内 SHALL 不出现重名分组。

#### Scenario: 单个簇含两个子分组

- **WHEN** parser 读到
  ```
  ### 经验条
  @程序 @GUI

  #### 基础信息
  - 当前等级标签右侧显示一条进度条
  - 进度条颜色为黄色

  #### 升级反馈
  - 经验条满格触发升级特效
  ```
- **THEN** 该簇的 IR SHALL 等于 `groups: [{title:'基础信息', bullets:['当前等级…', '进度条颜色…']}, {title:'升级反馈', bullets:['经验条满格…']}]`

#### Scenario: 簇没有子分组（向后兼容）

- **WHEN** parser 读到 `### 经验条\n@程序\n\n- 规则1\n- 规则2`（无任何 `####`）
- **THEN** 该簇 IR SHALL 等于 `groups: [{title: null, bullets: ['规则1', '规则2']}]`

#### Scenario: 游离 bullets 与子分组混用

- **WHEN** parser 读到 `### foo\n@GUI\n\n- 游离1\n\n#### 分组A\n- 在A的`
- **THEN** parser SHALL 返回 `ok: true`，IR 含两个 group（前一个 title=null），且 warnings 包含 `W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS`

#### Scenario: 子分组标题超长

- **WHEN** `####` 标题超过 12 个中文字
- **THEN** parser SHALL 报硬错误 `H_GROUP_TITLE_LEN_OVERFLOW`

#### Scenario: 同簇重名分组

- **WHEN** 一个 `### 簇` 内出现两个 `#### 基础信息`
- **THEN** parser SHALL 报硬错误 `H_GROUP_TITLE_DUPLICATE`

#### Scenario: H4 出现在簇外

- **WHEN** `####` 出现在 `## NN.` 与第一个 `###` 之间，或出现在文档其他禁止位置
- **THEN** parser SHALL 报硬错误 `H_H4_ORPHAN`

### Requirement: 全局规范章节自动识别

章节名命中关键字 `全局`、`规范`、`组件` 或 `汇总` 之一的 `## NN.` SHALL 被识别为 `isGlobalSpec=true`，使下游渲染跳过主图、气泡、占位文案。

#### Scenario: 章节命中关键字

- **WHEN** 章节名为 `## 03. 等级数字全局展示`
- **THEN** 该 section 的 IR `isGlobalSpec` SHALL 为 `true`

### Requirement: 角色名建议从七人名单选取（软约束）

`@角色` 不在 `{程序, GUI, 动效, 美术, 拼接, 音频, 后端}` 七人名单内时，parser SHALL emit 软警告 `W1_UNKNOWN_ROLE`，但不阻塞。

#### Scenario: 自定义角色名

- **WHEN** 文档中出现 `@后端`
- **THEN** parser SHALL 返回 `ok: true` 且 warnings 包含 `W1_UNKNOWN_ROLE`（"后端"不在白名单内时）
