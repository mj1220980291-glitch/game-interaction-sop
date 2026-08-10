## ADDED Requirements

### Requirement: 引入 Phase 0 翻库咨询阶段

SOP SHALL 在 Phase 1 第一回合开口前，由 Agent 内部完成 Phase 0 检索流程。Phase 0 不构成独立对话回合，其输出 SHALL 嵌入 Phase 1 第一回合的标准结构中。

**Phase 0 内部 8 步**：
1. 启动检查（项目根 `.interaction-sop/index.md` 是否存在）
2. 解析用户需求（提取意图关键词 / UI 信号，通过 glossary 别名归一）
3. 候选检索（仅读 frontmatter，按 `intent + ui - 2 × anti` 算分）
4. 候选筛选（0 → 退化；1 → 完整深入；2 → 都深入简版；≥3 → 深入分最高 2 个）
5. 深入读正文（与新需求三层对比：(a) 必复用骨架无矛盾 / (b) 可调参数待补 / (c) 差异领域命中 / (d) 已有具体决策 / (e) ⚠️ 与骨架矛盾）
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

Phase 0 嵌入 Phase 1 第一回合的输出 SHALL 包含三类信息：

- **基本可以复用**：从模式的"必复用核心骨架"中提取，与新需求无矛盾的部分
- **你这次需要单独定的**：从模式的"通常需要重定的参数"中提取
- **我留意到的差异**：从模式的"容易需要重新决策的地方"中扫新需求得到的命中点

输出 SHALL NOT 使用"命中 P-001，是否套用？"等机械化措辞。输出末尾 SHALL 固定一句"如果以上判断有问题，告诉我哪不对"以显式开放反驳通道。

#### Scenario: Agent 用机械化措辞输出

- **WHEN** Agent 在 Phase 0 命中后输出"命中 P-001。是否套用？请回答 yes/no"
- **THEN** 视为违反咨询式契约，应改为"看到你这个需求里 [X] 部分以前在 [案例] 做过..."加分层判断的咨询表述

#### Scenario: 输出缺少反驳通道

- **WHEN** Agent 完成 Phase 1 第一回合输出，但末尾未包含"如果方向不对告诉我"等显式反驳邀请
- **THEN** 视为违反协议，Agent 在后续轮次 SHALL 补足

### Requirement: Phase 0 SHALL 主动暴露策划文档与项目规范的冲突

当 Phase 0 深入对比发现 (策划文档需求 vs 模式核心骨架) 矛盾时，Agent SHALL 在输出中插入 ⚠️ 标记的"与项目规范的潜在冲突"段，呈现：

- 策划文档原文摘要
- 项目模式的核心约束原文
- 两种可能：「有意打破规范」与「策划顺手写错」
- 请求用户拍板

Agent SHALL NOT 自动选边（既不可"按规范来"也不可"按策划写的"）。

#### Scenario: 策划文档与模式骨架矛盾

- **WHEN** 策划文档写"玩家可同时打开两个对比面板"，P-001 骨架为"同时只显示一个二级浮层"
- **THEN** Agent 输出 SHALL 包含 ⚠️ 冲突段，列出两种可能并请求用户判断，禁止 Agent 自行决定按哪边走

#### Scenario: 用户对冲突未明确表态

- **WHEN** 用户在收到 ⚠️ 冲突提示后回答了别的问题，未对冲突表态
- **THEN** Agent 下一轮输出 SHALL 在第一个问题位置重新强调该冲突，直至用户明确拍板

### Requirement: 命中模式后的"采用契约" SHALL 跨 Phase 持续生效

用户在 Phase 1 第一回合（或后续轮）明确同意采用 P-XXX 时，Agent SHALL 在会话内维护"采用契约"状态：

- `adopted_patterns`：已采用的模式 ID 列表
- `confirmed_facts`：含模式骨架决策的自动注入
- `deviations_pending`：待写入 deviations.md 的偏离点
- `unresolved_conflicts`：未拍板的冲突
- `pending_questions`：剩余待问问题

采用契约 SHALL 自动跨 Phase 2 / Phase 3 / Phase 4 持续生效。Phase 2 写 v2 Markdown 时按采用契约直接产出；Phase 4 调引擎时同样按采用契约执行。采用契约 SHALL 不持久化到磁盘。

#### Scenario: Phase 2 按采用契约写 Markdown

- **WHEN** 用户在 Phase 1 采用 P-001，Phase 2 开始写 Markdown
- **THEN** Phase 2 SHALL 自动按 P-001 的核心骨架决策填写相关章节，不重新询问骨架内的事项

#### Scenario: 采用契约不持久化

- **WHEN** 用户关闭会话后重新打开，描述同一个需求
- **THEN** Agent SHALL 重新执行 Phase 0 检索流程，不假定上一次会话的采用契约仍然有效

### Requirement: 用户 SHALL 可通过自然语言撤销采用

用户在 Phase 1 后续轮 / Phase 2 / 3 / 4 任意时点说出撤销意图（如"P-001 不合适" / "这个不要参考之前的" / "换个思路，不复用了" / "把刚才的模式撤掉"），Agent SHALL 识别并执行状态回滚：

- `adopted_patterns` 清空
- `confirmed_facts` 中由模式注入的部分移除（保留用户后续自答的）
- `pending_questions` 按原 SOP 分类法重算
- `deviations_pending` 清空

若已落盘的 v2 Markdown 与撤销后状态冲突，Agent SHALL 主动提议重写。

#### Scenario: Phase 2 中用户撤销采用

- **WHEN** 用户在 Phase 2 看到 Markdown 后说"不要用 P-001 了，重新来"
- **THEN** Agent SHALL 撤销采用契约、提议重写 Markdown，并在重写前先存 .bak 备份

### Requirement: Phase 1 完成度评估 SHALL 新增"未决冲突清零"维度

Phase 1 进入 Phase 2 的完成条件 SHALL 同时满足下列 4 项：

1. 已采用模式的可调参数全部明确
2. 已采用模式的差异领域全部拍板
3. 业务专属问题（不被模式覆盖的部分）按原 SOP 完成度评估
4. `unresolved_conflicts` 状态为空

任一项不满足 SHALL 视为"信息不足"，禁止进入 Phase 2。即使用户显式说"直接写完整 Markdown"，仍 SHALL 先解决未决冲突。

#### Scenario: 有未决冲突时用户催推进

- **WHEN** 用户在 Phase 1 有未决冲突时说"直接写完整 Markdown 给我"
- **THEN** Agent SHALL 拒绝跳过冲突，输出"好的会直接写，但有一个冲突必须先定：xxx"，待冲突拍板后才推进

### Requirement: Phase 1 后续回合 SHALL 显示采用模式的注入内容

Phase 1 后续回合的"已确认"列表 SHALL 显示由采用模式自动注入的骨架决策，与用户明确答复区分但同列展示。当 `deviations_pending` 非空时，SHALL 在"已确认"段后额外输出"偏离备忘"段。

#### Scenario: 第二轮输出格式

- **WHEN** 用户在第一回合采用 P-001 并答了部分参数后进入第二轮
- **THEN** 第二轮"已确认"列表 SHALL 同时包含用户答复事项和"采用 P-001（战斗内选中+固定 TIPS）：..."形式的注入骨架列表，让用户能精准定位反驳目标

### Requirement: 引入 Phase 5 模式库提取与维护阶段

SOP SHALL 引入 Phase 5 阶段，承担两类场景：

- **冷启动**（显式或隐式触发）：扫历史交互文档批量提取模式入库
- **增量维护**（默认每次 Phase 4 完成后触发）：按风险分级处理模式库变更

#### Scenario: 用户显式触发冷启动

- **WHEN** 用户说"扫文档建库" / "导入历史" / "批量提取"
- **THEN** Agent SHALL 进入 Phase 5 冷启动流程（摸底 → 初读 → 聚类 → 单条提取 → 落盘）

#### Scenario: Phase 4 完成后默认触发增量

- **WHEN** SOP 完成 Phase 4 写入 Figma 后
- **THEN** Agent SHALL 默认触发 Phase 5 增量维护，按本次需求与库的关系做 6 路决策

### Requirement: Phase 5 冷启动 SHALL 分批 review 提取

Phase 5 冷启动 SHALL 遵循 5 步流程：摸底清单 → 初读 + 单文档摘要（分批 5 个/组）→ 聚类草案 + 用户 review → 单条模式提取 + 用户 review → 批量落盘 + 索引更新。

冷启动期间任何写盘操作 SHALL 在用户 review 通过后才执行；中途用户暂停 SHALL 不强制持久化进度，下次触发时按 patterns/ 目录现状增量继续。

#### Scenario: 冷启动中途用户暂停

- **WHEN** 用户在冷启动 review 到第 3 批后说"今天先到这里"
- **THEN** Agent SHALL 停止后续提取，已 review 通过的部分按正常落盘，未完成的批次丢弃；下次用户重新触发时 Agent SHALL 重扫 docs_archive，自动跳过已建模式

#### Scenario: Agent 凭空造模式

- **WHEN** Agent 在 Phase 5 提取时尝试创建一条 case_files 为空或仅含"想象案例"的模式
- **THEN** Agent SHALL 拒绝写入，提示"模式必须有真实案例文档支撑"

### Requirement: Phase 5 增量维护 SHALL 按风险分级自动化

Phase 5 增量维护操作 SHALL 按风险与可逆性分四级处理：

| 级别 | 操作类型 | 处理方式 |
|---|---|---|
| 低风险（数据追加型） | case_files 追加 / last_reviewed_at 更新 / glossary 同义词补充 / 一次性偏离记录追加 | 全自动 + maintenance.log |
| 低中风险（元数据修订型） | matching_signals 补充 / 项目术语别名更新 | 全自动 + maintenance.log |
| 中风险（立新模式） | 创建新 P-XXX 模式 | 草案直接落盘 + 一句话提示用户 + 用户可随时一句话推翻 |
| 高风险（结构性变更） | 拆分 / 合并 / 废弃 / 修改核心骨架字段 | Agent 写入 maintenance-suggestions.md，禁止自动执行，必须用户 review |

所有自动操作 SHALL 写入 maintenance.log，包含操作类型、目标 ID、关键参数。

#### Scenario: Agent 自动追加 case_files

- **WHEN** Phase 4 完成后 Agent 检测到本次需求完整套用了 P-001 无偏离
- **THEN** Agent SHALL 自动将本次交互文档追加到 P-001 的 case_files 字段，写入 maintenance.log，提示用户"P-001 案例 +1"

#### Scenario: Agent 立新模式

- **WHEN** Phase 4 完成后 Agent 判断本次需求适合立新模式 P-007
- **THEN** Agent SHALL 直接落盘 P-007 草案到 .interaction-sop/patterns/，写入 maintenance.log，输出"草拟新模式 P-007，要看吗？看完可以否决"

#### Scenario: Agent 自动执行结构性变更

- **WHEN** Agent 检测到 P-002 应当合并到 P-005 且未经用户授权
- **THEN** Agent SHALL NOT 自动执行合并，只能将建议写入 maintenance-suggestions.md，等待下次用户启动 SOP 时主动提示

### Requirement: 用户 SHALL 始终持有库变更的 override 权

不管 Agent 自动化程度多高，用户 SHALL 可通过自然语言随时执行以下操作：

- 停止自动维护（切回全 review 模式）
- 删除指定模式（如"P-007 直接删掉"）
- 按时间窗口回滚自动操作（如"把上周的所有自动操作撤销"，Agent 按 maintenance.log 倒序回滚）
- 冻结特定模式不再自动追加（如"P-001 不要再自动加 case 了"）

#### Scenario: 用户按时间窗口回滚

- **WHEN** 用户说"把昨天的所有自动操作撤销"
- **THEN** Agent SHALL 解析 maintenance.log 中昨天的所有自动操作条目，按倒序执行回滚（如新增模式则删除文件，追加 case_files 则移除条目），并在 log 末尾记录回滚动作

#### Scenario: 用户冻结特定模式

- **WHEN** 用户说"P-001 不要再自动加 case 了"
- **THEN** Agent SHALL 在 P-001 frontmatter 中标记 `auto_maintain: false`，后续相关增量操作 SHALL 改为询问而非自动执行
