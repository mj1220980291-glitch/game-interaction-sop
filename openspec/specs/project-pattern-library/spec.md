# project-pattern-library Specification

## Purpose
项目级模式库（Pattern Library）的格式契约，定义项目仓库内 `.interaction-sop/` 目录下各类文件的结构规范与行为约束。此 capability 与 SOP workflow 解耦——描述"项目侧产出物的结构契约"，供 skill 的 Phase 0（检索）和 Phase 5（提取维护）共同遵守。

## Requirements

### Requirement: 模式（Pattern）文件 SHALL 遵循统一 schema

每条模式条目存放于 `.interaction-sop/patterns/P-XXX.md`，由 YAML frontmatter + Markdown 正文组成。Frontmatter 字段集合与正文段标题集合由 skill 仓库的 `pattern-schema.md` 严格定义。Agent 写入新模式时 SHALL 完整填充 frontmatter 必填字段，正文 SHALL 包含全部固定二级标题段。

**Frontmatter 必填字段**：
- `id`（P-XXX，递增）
- `schema_version`（整数，与项目库全套版本一致）
- `type: pattern`
- `status`（active / deprecated / merged_into 三选一）
- `created_at` / `last_reviewed_at`（ISO 日期）
- `case_files`（数组，至少 1 项；每项含 `path` / `role`（base / reference）/ `extracted_at`）
- `domain`（自由文本，项目专属）
- `project_terms`（字符串数组）
- `matching_signals.intent_keywords` / `matching_signals.ui_signals` / `matching_signals.anti_signals`（三组数组全部必填）

**Frontmatter 选填字段**：
- `extends_pattern`（继承自其他模式 ID）
- `deprecates_pattern`（替换某个旧模式 ID）

**正文必含段（固定 H2 标题）**：
1. `## 一句话定位`
2. `## 核心交互逻辑`（按时间序口语化讲完整流程）
3. `## 必复用的核心骨架`（改这些会破坏整体一致性的规则）
4. `## 通常需要按需求重定的参数`（每次套用必定的参数化字段）
5. `## 容易需要重新决策的地方`（差异提示领域，如平台差异 / 信息密度 / 与现有规则冲突）
6. `## 案例对照`（每条案例含一句话摘要 + 文档相对路径）
7. `## 偏离历史`（初始为"暂无"）

#### Scenario: Agent 写入新模式时 frontmatter 必填字段缺失

- **WHEN** Agent 在 Phase 5 提取或增量维护时准备写入新模式，但 `matching_signals.anti_signals` 字段为空
- **THEN** Agent SHALL 拒绝写入，提示"anti_signals 不能为空，需从聚类时未入此模式的相似文档反推"

#### Scenario: case_files 为空时拒绝立模式

- **WHEN** Agent 在任何场景下尝试创建一条 `case_files` 为空的模式
- **THEN** Agent SHALL 拒绝写入，因为模式必须有真实案例文档支撑

#### Scenario: 模式正文缺少固定 H2 段

- **WHEN** 项目库中某条模式正文缺少"必复用的核心骨架"段
- **THEN** Phase 0 检索时 SHALL 视该模式为格式损坏，跳过命中并写 maintenance.log 记录问题

### Requirement: 索引（Index）文件 SHALL 作为项目库唯一入口

`.interaction-sop/index.md` SHALL 作为 Phase 0 检索的第一读取目标，且 SHALL 包含项目级元数据、术语表（glossary）、模式总览表与偏离记录索引。Phase 0 SHALL NOT 读取本文件以外的"魔法路径"作为模式库入口。

**Frontmatter 必填字段**：
- `schema_version`（整数）
- `project_name`（自由文本）
- `docs_archive`（相对项目根的路径，指向历史交互文档目录）
- `last_updated_at`（ISO 日期）
- `project_glossary`（数组，每项含 `term` / `aliases` / `first_seen`（模式 ID））

**正文必含段**：
1. `## 模式总览`（Markdown 表格：ID / 名称 / 一句话 / domain / 案例数 / status）
2. `## 偏离记录`（指向 `./deviations.md` 的引用 + 当前条目数）

#### Scenario: Phase 0 启动时 index.md 不存在

- **WHEN** SOP 进入 Phase 0 检测 `.interaction-sop/index.md` 文件不存在
- **THEN** Phase 0 SHALL 静默退化为原 Phase 1 标准流程，不向用户输出"未找到库"类提示

#### Scenario: Glossary 别名归一

- **WHEN** Phase 0 解析用户需求时遇到 glossary 中已登记为别名的词（如"信息卡片"是"TIPS"的别名）
- **THEN** Agent SHALL 在内部检索时将该词归一为主术语，提升 matching_signals 命中精度

### Requirement: 偏离（Deviation）记录 SHALL 单文件追加日志格式

`.interaction-sop/deviations.md` SHALL 采用 YAML 块以 `---` 分隔的追加日志格式，每条偏离 SHALL 写为一个独立 YAML 块。Agent 新增偏离 SHALL 仅在文件末尾追加，禁止重写或修改已有偏离条目。

**每条必填字段**：
- `deviation_id`（DEV-XXX，递增）
- `date`（ISO 日期）
- `deviates_from`（模式 ID）
- `case_file`（产生此偏离的交互文档路径）
- `deviation`（数组，描述具体偏离的决策点）
- `reason`（自由文本，必填，禁止留空）

#### Scenario: 偏离 reason 字段为空

- **WHEN** Agent 在 Phase 5 增量维护时准备写入新偏离记录，但 reason 字段为空
- **THEN** Agent SHALL 拒绝写入并要求补充"为什么这次要打破规范"的原因

#### Scenario: 偏离记录的追加而非重写

- **WHEN** Agent 写入新偏离记录到 deviations.md
- **THEN** Agent SHALL 仅在文件末尾追加新的 YAML 块，禁止重写或修改已有的偏离条目

### Requirement: maintenance.log SHALL 记录所有 Agent 自动操作

`.interaction-sop/maintenance.log` SHALL 作为 Agent 在增量维护时执行的所有自动操作的可追溯日志。Agent 任何由其自动落盘的操作（含立新模式、追加 case_files、写偏离、补 matching_signals、更新 glossary）SHALL 写入一条日志条目，格式为：`<ISO 时间戳> | <操作类型> | <目标 ID> | <关键参数>`，每行一条。

#### Scenario: Agent 自动追加 case_files

- **WHEN** Agent 在 Phase 5 增量维护时为已采用的 P-001 追加新案例文件
- **THEN** Agent SHALL 写入日志条目：`<timestamp> | P-001 case +1 | path=<案例路径>`

#### Scenario: 用户请求按日志回滚

- **WHEN** 用户说"把上周的所有自动操作撤销"
- **THEN** Agent SHALL 解析 maintenance.log 中匹配时间窗口的条目，按倒序执行回滚操作，并在 log 末尾记录回滚动作

### Requirement: 模式成熟度 SHALL 通过 case_files 数量隐式表达

模式库 SHALL NOT 引入显式"成熟度"字段。Agent 在 Phase 0 输出咨询时 SHALL 按 `case_files` 长度调整措辞强度：

- `case_files == 1`：种子模式，措辞软（"以前在 X 做过类似，具体逻辑可能还会调整"）
- `case_files == 2`：初步成熟，措辞中性（"以前在 X 和 Y 做过"）
- `case_files >= 3`：稳定模式，措辞硬（"这是项目里的常用模式"）

#### Scenario: 种子模式的咨询输出措辞

- **WHEN** Phase 0 命中 P-007 且其 `case_files` 仅有 1 条
- **THEN** Agent 输出的"看到相关历史"段 SHALL 使用软措辞（如"以前在 [X] 做过类似，具体逻辑可能还会调整"），不使用"这是项目常用模式"等硬措辞

### Requirement: 模式结构性变更 SHALL 由 Agent 建议 + 用户 review 才能执行

拆分（split）/ 合并（merge）/ 废弃（deprecate）/ 修改核心骨架字段属结构性变更，Agent 不可自动执行。Agent 检测到候选场景时 SHALL 写入 `.interaction-sop/maintenance-suggestions.md`，并在下次用户启动 SOP 时主动提示。

废弃模式 SHALL 标记 `status: deprecated`，Phase 0 检索时 SHALL 跳过 deprecated 模式但保留文件以备追溯。

#### Scenario: Agent 检测到模式应拆分

- **WHEN** Agent 扫库发现 P-001 被引用 5 次，其中 3 次都有"对建筑"相关偏离
- **THEN** Agent SHALL 将拆分建议写入 maintenance-suggestions.md，禁止自动执行拆分

#### Scenario: 用户授权执行结构性变更

- **WHEN** 用户在下次启动 SOP 时看到维护建议并明确同意拆分 P-001
- **THEN** Agent SHALL 执行拆分：创建 P-001a / P-001b，按用户指引分配 case_files，将旧 P-001 标记为 `status: deprecated` 并填写 `deprecated_into` 字段

### Requirement: Schema 版本号 SHALL 全套统一

项目库内 `index.md` / 所有 `patterns/P-*.md` / `deviations.md` 的 `schema_version` 字段 SHALL 保持相同整数值。skill 仓库定义当前 schema_version；项目库版本落后时 Phase 0 SHALL 提示一次"库 schema 落后，要升级吗？"，升级前 SHALL 不执行检索操作。

#### Scenario: 项目库 schema_version 与 skill 不匹配

- **WHEN** 项目 index.md 的 schema_version=1，skill 当前 schema_version=2
- **THEN** Phase 0 SHALL 在第一次启动时输出一次升级提示，提示前 SHALL 不输出任何检索结果

### Requirement: 项目术语表（Glossary）SHALL 由 Agent 在提取时维护

`index.md` 中 `project_glossary` 字段由 Agent 在 Phase 5 提取与增量维护时自动维护。Agent 写入新模式时 SHALL 扫描 `project_terms` 字段，与现有 glossary 比对，发现新词或可能的别名时 SHALL 提议合并并写入。

#### Scenario: Agent 发现新术语

- **WHEN** Agent 在提取新模式时遇到 `project_terms: [灵阵]`，glossary 中无此词
- **THEN** Agent SHALL 向 glossary 追加新条目 `{ term: 灵阵, aliases: [], first_seen: <当前模式 ID> }`

#### Scenario: Agent 检测到可能的别名

- **WHEN** Agent 写入新模式 `project_terms: [小兵]`，glossary 已有 `{ term: 部从, aliases: [单位], first_seen: P-001 }`，且当前模式语义上属于同一概念
- **THEN** Agent SHALL 在 maintenance.log 中记录"可能的别名归并建议"，并将该建议写入 maintenance-suggestions.md 留待用户 review

### Requirement: skill 仓库与项目仓库职责严格分离

skill 仓库 SHALL 仅携带 schema 定义文件（`pattern-schema.md` / `index-schema.md` / `deviation-schema.md`）与流程协议（`phase0-recall.md` / `phase5-extract.md`），SHALL NOT 携带任何具体模式实例或项目数据。

项目仓库 SHALL 在 `.interaction-sop/` 目录下存放自有模式库内容，目录结构由 skill 协议约定。skill 检索时 SHALL 不读取 `.interaction-sop/index.md` 之外的"魔法路径"。

#### Scenario: skill 仓库包含具体模式实例

- **WHEN** skill 仓库的 `packages/skill/` 下出现 `patterns/P-001.md` 等具体模式文件
- **THEN** 视为违反职责分离原则，PR review SHALL 拒绝合入

#### Scenario: 项目缺少 .interaction-sop 目录

- **WHEN** 用户在某项目首次使用 skill，项目根下无 `.interaction-sop/` 目录
- **THEN** SOP 行为 SHALL 与启用本 capability 之前完全一致，零迁移成本，无报错
