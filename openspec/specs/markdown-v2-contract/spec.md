# markdown-v2-contract Specification

## Purpose
TBD - created by archiving change v2-add-cluster-subgroup-headings. Update Purpose after archive.
## Requirements
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

当一个需求涉及同一功能的多种界面态（例：hover 前 / hover 后；普通 / 选中；默认 / 锁定）时，作者 SHALL 按下列规则决定拆 1 个还是 N 个章节：

a. 两态之间**功能模块差异 ≥ 2-3 个**（新增/移除/重命名的可识别信息块）→ 拆 N 个章节，每态对应 1 个章节
b. 否则 → 合 1 个章节，态差异通过簇/子分类/对比图表达

Parser MUST NOT 在当前版本自动校验此规则（无新增 hard error 或 soft warning）。Parser MAY 在未来版本基于章节内"态对比"标记做启发式辅助校验。LLM 在 Phase 2 Step 0.1 输出界面清单时 MUST 显式标注多态决策（拆 / 合 + 理由）。

#### Scenario: 大量态差异时拆章节

- **WHEN** 需求涉及"战场天书暗灰条态 (1 个元素)"与"战场天书展开态 (顶部信息条 + 5 张卡 + 锁按钮 + 使君形象 = 4 个新模块)"
- **THEN** 作者按指南拆成 2 个章节（差异 4 ≥ 2-3）

#### Scenario: 少量态差异时合章节

- **WHEN** 需求涉及"按钮默认态"与"按钮按下态"（仅视觉差异，无模块新增）
- **THEN** 作者按指南合成 1 个章节，用簇内规则描述两态差异

### Requirement: bullet 粒度为完整行为叙述而非原子规则

v2 Markdown 的簇内 bullet SHALL 以"一条 bullet = 一个完整行为叙述"为粒度：同一控件的常规规则可合并为一条含多动作串联的流畅叙述；需要强调、有风险、或需要执行角色特别注意的点 SHALL 独立成条。

本规则取代 skill 侧 `markdown-v2-spec.md` 原 W4"bullet 原子化：长复合规则拆多条"的表述。skill 侧文件与主 spec SHALL 同步反映本规则（受"skill 文档与 OpenSpec 主 spec 双向一致"既有 Requirement 约束）。Parser MUST NOT 为此新增校验码。

#### Scenario: 常规操作规则合并为一条

- **WHEN** 策划稿写"四键移动 / Shift 加速 / 空格跳 / 鼠标转视角"四条独立规则，均属角色移动控件
- **THEN** 产出的簇 SHALL 合并为一条 bullet（如"W/A/S/D 四键移动角色，按住 Shift 加速跑，按空格跳，滑动鼠标转动镜头视角"），而非四条原子 bullet

#### Scenario: 强调点独立成条

- **WHEN** 某控件存在需要执行角色特别注意的行为细节（如"呼出动作条时光标需从当前选中动作位置出现"）
- **THEN** 该细节 SHALL 独立成一条 bullet，不合并进常规叙述

### Requirement: 图上不可见的内容不进簇

簇内容 SHALL 仅包含在章节主图上有可指认 UI 锚点的规则。下列内容 SHALL NOT 写入簇：

- 纯服务端规则且无 UI 表现（持续时间、解除条件、并发裁决等由服务端控制、界面仅同步结果的规则——如需说明可在设计总览一句话带过）
- 纯环境演出（雾效切换、天空盒切换、落地烟花等无控件可指的演出）
- 预留不开发的交互
- 开关 / 状态的反面显然陈述（"关闭时不铺底色"这类与正面陈述互为镜像的内容）

丢弃决策的产生与用户确认流程由 skill-sop-workflow 的 Step 0.3"归位 + 显式丢弃清单"承载，本规则约束最终写入 Markdown 的内容边界。Parser MUST NOT 为此新增校验码。

#### Scenario: 服务端规则不进簇

- **WHEN** 策划稿写"泡泡持续时间等数值由服务端控制"且界面上无对应可见控件
- **THEN** 产出的 Markdown SHALL NOT 包含该规则的簇或 bullet

#### Scenario: 反面陈述不进簇

- **WHEN** 设置开关已正面陈述"开启时进入绘制画面自动铺底色"
- **THEN** 产出的 Markdown SHALL NOT 再写"关闭时保持当前颜色，不铺底色"的镜像 bullet

### Requirement: 同一控件的规则跨簇归位合并

同一 UI 控件的规则 SHALL 集中在该控件所属的一个簇内，不得按策划稿的段落结构分裂到多个簇。策划稿中分散在不同段落但指向同一控件的规则，转写时 SHALL 归位合并。Parser MUST NOT 为此新增校验码。

#### Scenario: 技能规则归位到技能按钮簇

- **WHEN** 策划稿在"操作方式"段写"F 键释放换色冲刺技能，有独立冷却"，在"HUD 说明"段写"右下技能占位按钮显示冷却状态"
- **THEN** 产出的 Markdown SHALL 把两处规则合并进"技能占位按钮"一个簇，而非分裂为"口哨与技能"与"技能占位按钮"两簇

### Requirement: 术语跟随设计稿实际文案

Markdown 中的控件名 / 状态名 SHALL 优先采用设计稿（草稿、截图、Figma 成品）上实际出现的文案，而非策划稿内部术语或 LLM 自造术语。两者冲突时以设计稿为准。Parser MUST NOT 为此新增校验码。

#### Scenario: 徽章名称以设计稿为准

- **WHEN** 策划稿称"警官蛋徽章"，设计稿图上的实际文案为"治安官"
- **THEN** 产出的 Markdown SHALL 使用"治安官"

#### Scenario: 控件通用名以设计稿为准

- **WHEN** LLM 惯用内部术语"pill 按钮"，但设计稿标注为"按钮"
- **THEN** 产出的 Markdown SHALL 使用设计稿的"按钮"表述

### Requirement: UI 反馈补全为 Phase 2 输出自检项

LLM 在 Phase 2 写每个控件簇时 SHALL 自检："该操作 / 状态有没有可见反馈？"策划稿未写明反馈时，LLM SHALL 按交互常识补一条反馈描述（toast / 浮显 / 高亮 / 音效等），以正常陈述语气写入 bullet，SHALL NOT 附加"待确认"类标记。

本规则不依赖 Phase 1 提问挖掘——反馈补全是转写完整性的一部分，属设计师职责范围内的主动拍板。Parser MUST NOT 为此新增校验码。

#### Scenario: 持续状态补 toast 提示

- **WHEN** 策划稿写"按住左键进入锁定朝向"但未写锁定期间的界面提示
- **THEN** 产出的 bullet SHALL 主动补充可见反馈（如"按住期间顶部显示 toast 提示'朝向锁定中…'"），且不带待确认标记

#### Scenario: 反馈已在策划稿写明

- **WHEN** 策划稿已明确写"落地触发烟花特效"且该特效在图上有可见表现
- **THEN** LLM SHALL 直接转写，不重复补充其他反馈

### Requirement: bullet 只写设计稿看不出来的信息增量

v2 Markdown 的簇内 bullet SHALL 只承载设计稿（主图 / 配图）上看不出来的信息增量：交互行为、状态切换、边界条件、配表分工、动效时机与曲线。下列内容 SHALL NOT 写成 bullet：

- 设计稿上肉眼可见的静态信息（位置、排列方向、行数、颜色、图标样式）——除非与行为/对齐方式等不可见约束绑定，此时只写该约束（如"底对齐"）
- 穷举式范围声明（如"除房主设置房间面板、地图选择界面、ESC 设置面板、F1 说明面板外，所有界面常驻显示"）
- 描述占位物本身的句子（如"当前稿统一为 `X 操作名称` 占位文案，实际键位与文案待定稿"）
- 逐条列举的参数 / 数值清单——SHALL 收束为一句"具体参数策划配表即可"（或等价表述）

每个 `###` 簇的 bullet 数（不含 `配图：`）SHALL 以 3–6 条为目标；超过 6 条时 LLM SHALL 先按本规则与"同义 bullet 合并"规则删减，仍超过且能明确分类时才使用 `####`。

Parser MUST NOT 为此新增校验码。skill 侧 `references/markdown-v2-spec.md` SHALL 以 T6 条目同步反映本规则。

#### Scenario: 可见布局信息被删

- **WHEN** 策划稿写"键位提示位于屏幕左下，固定 5 行，每行左侧为按键图标、右侧为操作名称"，主图已清晰展示该布局
- **THEN** 产出的 bullet SHALL 不复述行数与布局，仅保留不可见约束（如"键位由策划配表，底对齐"）

#### Scenario: 参数清单收束

- **WHEN** 某设置面板有 8 条参数，策划稿逐条列出参数名与默认值
- **THEN** 产出的簇 SHALL 写一条"参数逐行竖向排列，具体控件参数策划配表即可"，SHALL NOT 逐条列举 8 条参数

#### Scenario: 穷举范围声明不写

- **WHEN** 策划稿写"除 A/B/C/D 四个面板外所有界面常驻显示"
- **THEN** 产出的 Markdown SHALL NOT 包含该穷举句

### Requirement: 同簇同义 bullet 合并

同一 `###` 簇内语义重复的 bullet SHALL 合并为一条。典型情形：一条普通规则与一条同义的状态行描述同一表现。Parser MUST NOT 为此新增校验码。

#### Scenario: 状态条目与规则重复

- **WHEN** 簇内同时存在"猎人获胜时显示 `猎人获胜！`"与"猎人胜利状态：猎人获胜时进入"
- **THEN** 产出的 Markdown SHALL 只保留其中一条

### Requirement: 配图 bullet 原位插入且一簇允许多张

`- 配图：xxx` bullet SHALL 紧跟在它所说明的那条规则之后，位置即语义；一个 `###` 簇 SHALL 允许包含多条 `配图：` bullet。存在多条状态行的簇 SHALL 优先采用一态一图。`配图：` 后的说明 SHALL 是给设计师的一句"截什么"。

本规则取代原"`配图：` 作为该 `###` 内最后一条 bullet"的表述。Parser MUST NOT 为配图位置或数量新增校验码。渲染器 SHALL 按 bullet 顺序原位渲染每条 `配图：`（见 `figma-template-1-14-rendering`「配图按 bullet 原位渲染且一簇多张」）。

#### Scenario: 配图紧跟所说明规则

- **WHEN** 簇内第 3 条规则描述"结算阶段隐藏阶段名，仅保留倒计时并居中"，需要一张结算态示意图
- **THEN** 对应 `- 配图：结算态倒计时居中` SHALL 紧跟在第 3 条之后，而非移到簇末

#### Scenario: 状态类一态一图

- **WHEN** `### 地图卡片` 簇有默认 / 悬停 / 选中 / 带 MOD 标签四种状态
- **THEN** 每条状态行后 SHALL 各跟一条 `配图：` bullet

### Requirement: 动效 bullet 直接书写且先情况后动效

描述动效的 bullet SHALL 直接写成一句 `[什么情况下]，[需要什么样的动效]`：前半句写触发的情况（时机 / 事件），后半句写动效本身（谁动、怎么变、什么节奏）。该 bullet SHALL NOT 带 `动效需求：` 或任何前缀，SHALL NOT 使用冒号说明格式（冒号格式只属于状态行）。两半缺一不可，SHALL NOT 倒装（先写动效再补情况），并满足：

- 同一簇内同类元素（数字类 / 头像类 / 按钮类等）的动效 SHALL 合并为一条，情况并列写在前半句
- 有显隐变化的 UI SHALL 同时覆盖出现与隐藏两种情况
- 后半句 SHALL NOT 为"形式待定 / 节奏由策划配置"类空句；LLM SHALL 按交互常识直接给出变化与节奏（如"由快到慢，不要匀速"），不加待确认标记

动效句与状态行（「状态行语法」）SHALL 分开书写：状态行只写进入 / 退出条件，动效句只写情况与动效。Parser MUST NOT 为此新增校验码。

#### Scenario: 同类数字动效合并

- **WHEN** 簇内有"躲藏分数增加时数字滚动"与"击杀数增加时数字滚动"两条
- **THEN** 产出 SHALL 合并为一条"躲藏分数或击杀数增加时，对应数字快速滚动后减速落定"

#### Scenario: 节奏不写空句

- **WHEN** 策划稿只写"逐个头像高亮，节奏由策划配置"
- **THEN** 产出 SHALL 给出具体节奏（如"抽选开始时，头像逐个高亮，速度由快到慢，不要匀速"），SHALL NOT 保留"由策划配置"

#### Scenario: 显隐双链路

- **WHEN** 阶段名与倒计时组件在阶段切换时出现并在结算时隐藏
- **THEN** 动效 bullet SHALL 同时写出阶段切换与结算两种情况下的动效

#### Scenario: 不倒装

- **WHEN** 草稿写成"卡片放大回弹，在选中时播放"
- **THEN** 产出 SHALL 改为"选中卡片时，卡片放大回弹，先快后慢"

#### Scenario: 不加前缀

- **WHEN** 草稿写成"动效需求：选中卡片时，卡片放大回弹，先快后慢"
- **THEN** 产出 SHALL 去掉前缀，改为"选中卡片时，卡片放大回弹，先快后慢"

### Requirement: 状态行语法

簇内描述界面状态的 bullet SHALL 写成 `- <名字>状态：<出现条件>`；不需要说明出现条件的简单状态 SHALL 只写 `- <名字>状态`。冒号后 SHALL 写该状态**在什么情况下出现 / 如何退出**，SHALL NOT 描述外观（外观由配图承载）。需要配图时 SHALL 在状态行后单独跟一条 `- 配图：xxx`。

状态行 SHALL NOT 使用 `状态·`、`状态｜` 等前缀，SHALL NOT 使用 `·` 符号。状态行 SHALL NOT 描述动效；进入 / 退出该状态时的动效 SHALL 另起一条动效句（见「动效 bullet 直接书写且先情况后动效」）。冒号说明格式 SHALL 只用于状态行。

识别规则（parser、渲染器共用）：取第一个 `：` / `:` 之前的部分（无冒号则整行）为 head；head 以"状态"结尾、长度 3–10 个字符、不含 `，,。；;、` 标点，且整行不以 `配图`、`动效需求` 开头时，该 bullet 为状态行，head 为状态名。

#### Scenario: 带出现条件的状态
- **WHEN** 技能按钮释放后进入冷却，冷却结束恢复
- **THEN** 产出 SHALL 为 `- 冷却状态：技能释放后进入，冷却结束恢复默认`，后跟 `- 配图：技能冷却态`

#### Scenario: 简单状态只写名字
- **WHEN** 卡片默认态无需说明出现条件
- **THEN** 产出 SHALL 为 `- 默认状态`，SHALL NOT 补写"无描边"等外观描述

#### Scenario: 普通句子不被识别为状态行
- **WHEN** bullet 为 `进入战斗状态后顶部显示血条` 或 `进入选中状态时，卡片放大回弹，先快后慢`
- **THEN** 该 bullet SHALL NOT 被识别为状态行

#### Scenario: 旧前缀提醒
- **WHEN** bullet 以 `状态·` 或 `状态｜` 开头
- **THEN** parser SHALL 产生软警告 `V2_W_LEGACY_STATE_PREFIX`，渲染按普通 bullet 处理

#### Scenario: 状态与动效拆成两条
- **WHEN** 选中卡片后进入选中状态，并伴随放大回弹动效
- **THEN** 产出 SHALL 为 `- 选中状态：点击卡片后进入` 与 `- 进入选中状态时，卡片放大回弹，先快后慢` 两条，SHALL NOT 把动效写进状态行

### Requirement: 簇内叙述顺序

每个 `###` 簇（有 `####` 时为每个分组）内的 bullet SHALL 按以下顺序书写，没有内容的段跳过：

1. **是什么**：作用、何时出现、数据来源；不写设计稿可见的位置与外观
2. **怎么交互**：操作及其直接结果；不形成状态的边界情况（如资源不足弹 toast）紧跟触发它的交互
3. **有哪些状态**：状态行（见「状态行语法」），能写成状态的边界情况（冷却、锁定、为空等）归入此段
4. **反馈**：toast / 音效 / 特效等；动效句放在最后

`配图：` 行跟随它说明的 bullet，不改变所在段落。Parser SHALL 仅对可机械判断的一点给出软警告：同组内状态行之间夹有普通规则 → `V2_W_STATE_LINES_SCATTERED`，判断时忽略 `配图：` 行。动效句没有前缀，parser MUST NOT 尝试识别其位置。

#### Scenario: 完整四段
- **WHEN** `### 技能按钮` 簇有定位、点击释放、冷却与禁用两种状态、释放音效与动效
- **THEN** bullet 顺序 SHALL 为：定位 → 点击释放 → `冷却状态：…` → `禁用状态：…` → 音效 → 动效句

#### Scenario: 纯展示簇
- **WHEN** 簇只展示分数，无可操作行为
- **THEN** 簇 SHALL 只包含"是什么 → 状态 → 反馈"中存在的段，不写交互段

#### Scenario: 状态行被打散
- **WHEN** 同一组内依次为 `默认状态`、一条普通规则、`选中状态：…`
- **THEN** parser SHALL 产生 `V2_W_STATE_LINES_SCATTERED`，渲染照常进行

