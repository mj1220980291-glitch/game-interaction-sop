# skill-sop-workflow Specification

## Purpose
TBD - created by archiving change add-classify-prephase-for-markdown. Update Purpose after archive.
## Requirements
### Requirement: phase2 写完整 Markdown 前必须完成 4 步分类决策

当 SOP 进入 phase2（v2 Markdown 生成）时，LLM SHALL 在输出完整 Markdown 之前依次完成下列 4 个子步骤，每步以用户确认作为通过门：

- **Step 0.1 界面清单**：LLM 列出本需求涉及的"界面 / 场景态"清单，每项含一句功能定位；输出给用户审核 / 补充
- **Step 0.2 功能模块清单**：对每个已确认的界面，LLM 列出玩家能识别的"功能模块 / 信息块"清单；输出给用户审核
- **Step 0.3 规则归位映射**：LLM 拿策划稿每条规则尝试归位到 (界面, 模块) 二元组；归位不上的规则 flag 出来跟用户确认是否漏界面 / 漏模块或属跨界面全局规则
- **Step 0.4 终态确认**：用户对完整 (界面 ↔ 章节, 模块 ↔ 簇) 分类决策 OK 后，LLM 才允许进入 Step 1（写完整 Markdown）

下游派生关系 MUST 严格按 (界面 = `## NN. 章节`, 模块 = `### 簇`) 对应。

#### Scenario: 用户给一份策划文档启动 phase2

- **WHEN** 用户在 phase1 完成后让 LLM 写 v2 Markdown
- **THEN** LLM 第一轮 SHALL 输出 Step 0.1 界面清单（不立即写完整 Markdown），询问用户是否需要补充 / 调整

#### Scenario: 用户跳过分类决策直接催 LLM 出 Markdown

- **WHEN** 用户进入 phase2 后说"直接写完整 markdown 给我"
- **THEN** LLM SHALL 拒绝跳过 Step 0，提示"按 SOP 流程需要先完成 4 步分类决策；跳过会导致章节/簇分类偏差"，仍输出 Step 0.1 清单

#### Scenario: Step 0.1 与 Step 0.2 合并输出

- **WHEN** 需求规模小（涉及界面 ≤ 2 个），LLM 决定把 0.1 + 0.2 合并到一轮输出
- **THEN** 合并输出 SHALL 仍保留两段清单的结构化区分（界面清单段 + 各界面下模块清单段），用户能分别审核

#### Scenario: 多态拆分决策在 Step 0.1 显式说明

- **WHEN** 需求涉及同一功能多态（如 hover 前 / 后）
- **THEN** Step 0.1 输出 SHALL 显式列"这两态拆 N 个界面 / 合 1 个界面"的决策与一句理由（依据 markdown-v2-contract 多态拆分指南）

### Requirement: phase2 自检清单前置 4 条分类决策项

phase2 在 LLM 输出完整 Markdown 后给用户的自检清单中，MUST 在原有条目最前增加下列 4 条 checkbox：

- `[ ] 0.1 界面/场景态清单已与用户确认`
- `[ ] 0.2 每个界面的功能模块清单已与用户确认`
- `[ ] 0.3 策划稿每条规则已归位（含无法归位的 flag 与处理）`
- `[ ] 0.4 完整分类决策（界面 ↔ 章节, 模块 ↔ 簇）已与用户确认`

#### Scenario: 自检清单展示

- **WHEN** LLM 完成完整 Markdown 输出并准备请求用户审核
- **THEN** 自检清单的前 4 条 SHALL 是上述 Step 0 条目，按 0.1 → 0.4 顺序

### Requirement: phase2 文档去除 ###命名规则的内部矛盾

`packages/skill/phases/phase2-markdown.md` SHALL 对 `###` 簇命名给出单一一致的指引：簇名是该功能模块 / 信息块的名词性命名；行为单元可用 `xxx 行为` / `xxx 流程` 等替代名词；禁止动作过程动词短语（"触发与传送" / "候选下发" 这类）作为 `###` 命名风格。

`phase2-markdown.md` 内 SHALL NOT 出现互相矛盾的两套引导。

#### Scenario: phase2-markdown.md 修订后规则一致

- **WHEN** 读 `packages/skill/phases/phase2-markdown.md` 全文
- **THEN** 所有提到 `###` 命名风格的段落 SHALL 表述一致（"功能模块 / 信息块名词，可用行为/流程后缀替代名词"），不出现 L96 风格的"语义动词短语" 表述

### Requirement: skill 文档与 OpenSpec 主 spec 双向一致

`packages/skill/references/markdown-v2-spec.md` 与 `openspec/specs/markdown-v2-contract/spec.md` SHALL 在校验规则与禁词清单上保持一致。任何一方更新 SHALL 同步另一方。

#### Scenario: 增加新禁词时双向同步

- **WHEN** OpenSpec 主 spec 在 ADDED/MODIFIED Requirement 中扩了 W6 禁词清单
- **THEN** 同一 PR / commit 必须同时更新 `packages/skill/references/markdown-v2-spec.md` 反映新清单

#### Scenario: skill 文档独立修改不允许

- **WHEN** 作者仅修改 `packages/skill/references/markdown-v2-spec.md` 增加禁词但未同步主 spec
- **THEN** 视为契约不一致，PR review 应拒绝

### Requirement: 引入 Phase 0 翻库咨询阶段

SOP SHALL 在 Phase 1 第一回合开口前，由 Agent 内部完成 Phase 0 检索流程。Phase 0 不构成独立对话回合，其输出 SHALL 嵌入 Phase 1 第一回合的标准结构中。

**Phase 0 内部 8 步**：
1. 启动检查（项目根 `.interaction-sop/index.md` 是否存在）
2. 解析用户需求（提取意图关键词 / UI 信号，通过 glossary 别名归一）
3. 候选检索（仅读 frontmatter，按 `intent + ui - 2 × anti` 算分）
4. 候选筛选（0 → 退化；1 → 完整深入；2 → 都深入简版；≥3 → 深入分最高 2 个）
5. 深入读正文（与新需求三层对比）
6. 评估覆盖范围（全覆盖 vs 部分覆盖，措辞区分）
7. 嵌入 Phase 1 第一回合输出
8. 退化（无库 / 无命中时静默走原 Phase 1）

#### Scenario: 项目无 .interaction-sop 目录时进入 Phase 0

- **WHEN** SOP 进入 Phase 0 检测到项目根无 `.interaction-sop/` 目录
- **THEN** Phase 0 SHALL 静默退化为原 Phase 1，不输出"未找到库"或"我查过没找到"类提示

#### Scenario: 命中 1 个模式且部分覆盖

- **WHEN** Phase 0 命中 P-001 但仅覆盖新需求的部分功能
- **THEN** Phase 1 第一回合输出 SHALL 使用"你这个需求里的 [具体段] 部分像 P-001"措辞，禁止使用"这个需求基本就是 P-001"全覆盖措辞

#### Scenario: 命中 ≥3 个候选模式

- **WHEN** Phase 0 候选阶段筛出 4 个分数达阈值的模式
- **THEN** Agent SHALL 仅深入展开分数最高的 2 个，其余在输出末尾以"另外检索到 P-005 / P-007 可能相关，要展开吗？"形式列出

### Requirement: Phase 0 咨询式输出 SHALL 替代机械式 yes/no 查询

Phase 0 嵌入 Phase 1 第一回合的冲突段 SHALL 使用表格格式（每条冲突一行），不得使用展开段落逐条列举"策划写xxx / 规范是xxx / 两种可能"的形式。

Phase 0 内部思考过程（读了哪些模式、打分结果、候选筛选明细）SHALL NOT 出现在用户可见输出中（硬规则 R-Output-1）。

#### Scenario: Agent 用机械化措辞输出

- **WHEN** Agent 在 Phase 0 命中后输出"命中 P-001。是否套用？请回答 yes/no"
- **THEN** 视为违反咨询式契约，应改为咨询式建议 + 表格冲突格式

#### Scenario: 输出缺少反驳通道

- **WHEN** Agent 完成 Phase 1 第一回合输出，但末尾未包含"如果以上判断有问题，告诉我哪不对"等显式反驳邀请
- **THEN** 视为违反协议

#### Scenario: 内部过程出现在输出中

- **WHEN** Agent 在 Phase 1 第一回合中输出"Phase 0 打分：P-001 得 4 分，高于阈值 2 分"等内部信息
- **THEN** 视为违反 R-Output-1，应立即删除内部信息，仅保留用户可见内容

### Requirement: Phase 0 SHALL 主动暴露策划文档与项目规范的冲突

当 Phase 0 深入对比发现 (策划文档需求 vs 模式核心骨架) 矛盾时，Agent SHALL 在输出中插入冲突表格，表格格式：`| # | 策划写 | P-XXX 骨架 | 备注 |`。Agent SHALL NOT 自动选边。

#### Scenario: 策划文档与模式骨架矛盾

- **WHEN** 策划文档写"玩家可同时打开两个对比面板"，P-001 骨架为"同时只显示一个二级浮层"
- **THEN** Agent 输出 SHALL 包含冲突表格，每条冲突一行，备注列写一句话说明影响，禁止 Agent 自行决定按哪边走

#### Scenario: 用户对冲突未明确表态

- **WHEN** 用户在收到冲突表格后回答了别的问题，未对冲突表态
- **THEN** Agent 下一轮输出 SHALL 在第一个问题位置重新列出未拍板的冲突，直至用户明确

### Requirement: 命中模式后的"采用契约" SHALL 跨 Phase 持续生效

用户在 Phase 1 第一回合（或后续轮）明确同意采用 P-XXX 时，Agent SHALL 在会话内维护"采用契约"状态（adopted_patterns / confirmed_facts / deviations_pending / unresolved_conflicts / pending_questions）。采用契约 SHALL 自动跨 Phase 2 / 3 / 4 持续生效，不持久化到磁盘。

#### Scenario: Phase 2 按采用契约写 Markdown

- **WHEN** 用户在 Phase 1 采用 P-001，Phase 2 开始写 Markdown
- **THEN** Phase 2 SHALL 自动按 P-001 的核心骨架决策填写相关章节，不重新询问骨架内的事项

#### Scenario: 采用契约不持久化

- **WHEN** 用户关闭会话后重新打开，描述同一个需求
- **THEN** Agent SHALL 重新执行 Phase 0 检索流程，不假定上一次会话的采用契约仍然有效

### Requirement: 用户 SHALL 可通过自然语言撤销采用

用户在任意 Phase 说出撤销意图时，Agent SHALL 识别并执行状态回滚（清空 adopted_patterns 中对应条目、移除其骨架注入、重算 pending_questions）。若已落盘的 v2 Markdown 与撤销后状态冲突，Agent SHALL 主动提议重写。

#### Scenario: Phase 2 中用户撤销采用

- **WHEN** 用户在 Phase 2 看到 Markdown 后说"不要用 P-001 了，重新来"
- **THEN** Agent SHALL 撤销采用契约、提议重写 Markdown，并在重写前先存 .bak 备份

### Requirement: Phase 1 完成度评估 SHALL 新增"未决冲突清零"维度

Phase 1 进入 Phase 2 的完成条件 SHALL 同时满足：(1) 已采用模式的可调参数全部明确；(2) 差异领域全部拍板；(3) 业务专属问题完成；(4) unresolved_conflicts 为空。

#### Scenario: 有未决冲突时用户催推进

- **WHEN** 用户在 Phase 1 有未决冲突时说"直接写完整 Markdown 给我"
- **THEN** Agent SHALL 拒绝跳过冲突，输出"好的会直接写，但有一个冲突必须先定：xxx"，待冲突拍板后才推进

### Requirement: 引入 Phase 5 模式库提取与维护阶段

SOP SHALL 引入 Phase 5 阶段，承担冷启动批量提取和增量维护两类场景。增量维护操作 SHALL 按风险分级处理（数据追加全自动 / 元数据修订全自动 / 立新模式轻确认 / 结构性变更必 review）。所有自动操作 SHALL 写入 maintenance.log。

#### Scenario: 用户显式触发冷启动

- **WHEN** 用户说"扫文档建库" / "导入历史" / "批量提取"
- **THEN** Agent SHALL 进入 Phase 5 冷启动流程（摸底 → 初读 → 聚类 → 单条提取 → 落盘）

#### Scenario: Phase 4 完成后默认触发增量

- **WHEN** SOP 完成 Phase 4 写入 Figma 后
- **THEN** Agent SHALL 默认触发 Phase 5 增量维护，按本次需求与库的关系做 6 路决策

### Requirement: Phase 5 增量维护 SHALL 按风险分级自动化

Phase 5 增量维护操作 SHALL 按风险与可逆性分四级处理：

| 级别 | 操作类型 | 处理方式 |
|---|---|---|
| 低风险（数据追加型） | case_files 追加 / last_reviewed_at 更新 / glossary 同义词补充 / 一次性偏离记录追加 | 全自动 + maintenance.log |
| 低中风险（元数据修订型） | matching_signals 补充 / 项目术语别名更新 | 全自动 + maintenance.log |
| 中风险（立新模式） | 创建新 P-XXX 模式 | 草案直接落盘 + 一句话提示用户 + 用户可随时一句话推翻 |
| 高风险（结构性变更） | 拆分 / 合并 / 废弃 / 修改核心骨架字段 | Agent 写入 maintenance-suggestions.md，禁止自动执行，必须用户 review |

#### Scenario: Agent 自动追加 case_files

- **WHEN** Phase 4 完成后 Agent 检测到本次需求完整套用了 P-001 无偏离
- **THEN** Agent SHALL 自动将本次交互文档追加到 P-001 的 case_files 字段，写入 maintenance.log，提示用户"P-001 案例 +1"

#### Scenario: Agent 自动执行结构性变更

- **WHEN** Agent 检测到 P-002 应当合并到 P-005 且未经用户授权
- **THEN** Agent SHALL NOT 自动执行合并，只能将建议写入 maintenance-suggestions.md

### Requirement: 用户 SHALL 始终持有库变更的 override 权

用户 SHALL 可通过自然语言随时停止自动维护、删除指定模式、按时间窗口回滚自动操作、或冻结特定模式不再自动追加。

#### Scenario: 用户按时间窗口回滚

- **WHEN** 用户说"把昨天的所有自动操作撤销"
- **THEN** Agent SHALL 解析 maintenance.log 中昨天的所有自动操作条目，按倒序执行回滚，并在 log 末尾记录回滚动作

#### Scenario: 用户冻结特定模式

- **WHEN** 用户说"P-001 不要再自动加 case 了"
- **THEN** Agent SHALL 在 P-001 frontmatter 中标记 `auto_maintain: false`，后续相关增量操作 SHALL 改为询问而非自动执行

