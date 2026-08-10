## 1. Schema 契约文件（skill 仓库 references/）

- [x] 1.1 创建 `packages/skill/references/pattern-schema.md`，定义 Pattern frontmatter 必填/选填字段、正文 7 段固定标题、字段值域与示例
- [x] 1.2 创建 `packages/skill/references/index-schema.md`，定义 `index.md` frontmatter（含 project_glossary 结构）、模式总览表格式、偏离记录引用方式
- [x] 1.3 创建 `packages/skill/references/deviation-schema.md`，定义 `deviations.md` YAML 块格式、字段必填规则、追加日志约束
- [x] 1.4 在三个 schema 文件统一标注当前 `schema_version: 1`，并预留"未来演进时迁移协议"占位段

## 2. Phase 0 检索协议（skill 仓库 phases/）

- [x] 2.1 创建 `packages/skill/phases/phase0-recall.md`，写明 8 步内部流程（启动检查 → 解析需求 → 候选检索 → 筛选 → 深入对比 → 评估覆盖 → 嵌入 Phase 1 → 退化）
- [x] 2.2 在 phase0-recall.md 写入候选打分公式 `intent + ui - 2 × anti`、阈值自适应指引、命中数分支（0/1/2/3+）处理
- [x] 2.3 在 phase0-recall.md 写入"咨询式输出模板"三类（命中 1 个部分覆盖 / 命中 2 个 / 命中 ≥3 个）+ 反驳通道固定语
- [x] 2.4 在 phase0-recall.md 写入"⚠️ 冲突处理"段：硬规则 R1（Agent 不可替策划判定）、冲突暴露格式、两种可能措辞
- [x] 2.5 在 phase0-recall.md 写入 maturity 措辞规则（case_files 数量对应软/中性/硬措辞）
- [x] 2.6 在 phase0-recall.md 写入退化路径（无目录 / 模式表空 / 全部低分 / schema 版本不匹配）

## 3. Phase 5 提取协议（skill 仓库 phases/）

- [x] 3.1 创建 `packages/skill/phases/phase5-extract.md`，分两大场景：冷启动 + 增量
- [x] 3.2 在 phase5-extract.md 写入冷启动 5 步（摸底 → 初读分批 5 个 → 聚类 → 单条提取 → 落盘），含"独立/难分类" 标识方式
- [x] 3.3 在 phase5-extract.md 写入冷启动期间用户暂停的处理（不持久化、跨日重启时重扫跳过已建）
- [x] 3.4 在 phase5-extract.md 写入增量 6 路决策（全新 / 完整套用 / 有偏离 / 偏离过多 / 漏命中 / 跨界场景）
- [x] 3.5 在 phase5-extract.md 写入增量分级表（数据追加全自动 / 元数据修订全自动 / 立新模式轻确认 / 结构变更必 review）
- [x] 3.6 在 phase5-extract.md 写入 9 条硬规则（R-Extract-1 ~ R-Extract-9，含 case_files ≥1、不凭空造、anti_signals 必填、增量永远主动问 / 写、reason 必填等）
- [x] 3.7 在 phase5-extract.md 写入 Glossary 自动维护流程（提取时扫 project_terms / 别名归并提议）
- [x] 3.8 在 phase5-extract.md 写入用户 override 能力（停自动、删模式、按时间窗口回滚、冻结模式）

## 4. Phase 1 改造（skill 仓库 phases/phase1-analysis.md）

- [x] 4.1 在 `packages/skill/phases/phase1-analysis.md` 顶部加"与 Phase 0 的衔接"说明段
- [x] 4.2 修改"第一回合标准结构"段，分两套模板（命中模式 / 未命中），命中模板包含咨询式三段 + 可选 ⚠️ 冲突段 + 反驳通道
- [x] 4.3 修改"后续回合标准结构"段，"已确认"列表显示采用模式注入的骨架，添加 `deviations_pending` 非空时的"偏离备忘"段
- [x] 4.4 新增"采用契约（会话级状态）"段，定义 5 个状态字段（adopted_patterns / confirmed_facts / deviations_pending / unresolved_conflicts / pending_questions），明确不持久化
- [x] 4.5 修改"完成度评估"段，新增 4 维度（可调参数齐 / 差异领域定 / 业务专属齐 / 未决冲突清零）
- [x] 4.6 新增"中途撤销采用"段，含自然语言识别词典 + 状态回滚流程 + 已落盘 Markdown 重写提议
- [x] 4.7 修改"提问纪律"与"完成度评估"段，标注骨架已锁定的问题不再问
- [x] 4.8 修改"Phase 1 结束信号"段，加入"采用契约摘要"输出（含已采用模式 / 偏离待审核数 / 业务专属决策数）

## 5. SKILL.md 整体改造

- [x] 5.1 修改 `packages/skill/SKILL.md` 中的"完整 SOP" ASCII 图，加入 Phase 0（在 Phase 1 之前，嵌入式）与 Phase 5（在 Phase 4 之后，含冷启动触发说明）
- [x] 5.2 修改"Phase 切换规则"表，新增 Phase 0 / Phase 5 的进入/完成/失败回退条件
- [x] 5.3 在"全局原则"段新增"项目库优先"子段，引用 phase0-recall.md
- [x] 5.4 修改"输出契约"表，新增 Phase 5 的输出物（patterns/*.md / index.md / deviations.md / maintenance.log）与落地位置
- [x] 5.5 修改"文件索引"段，新增 phase0-recall.md / phase5-extract.md 与 3 个 schema 文件的索引
- [x] 5.6 在"一句话主义"段补充"项目库的具体内容不归 skill 管，仅由 schema 约束"

## 6. 一致性与边界

- [x] 6.1 检查所有新文档与 `openspec/specs/markdown-v2-contract/spec.md`（Phase 2 规则）无冲突
- [x] 6.2 检查 phase0-recall.md 与 phase1-analysis.md 的"嵌入位置"描述一致（同一段不在两处描述相互矛盾）
- [x] 6.3 检查 phase5-extract.md 与 SKILL.md 的"触发条件"描述一致
- [x] 6.4 在所有新 schema 文件末尾标注"双向一致原则"：与项目库实例不一致时以 skill 仓库 schema 为准

## 7. 验证

- [x] 7.1 运行 `openspec validate add-pattern-library-recall --strict`，确认 spec/proposal/design/tasks 通过校验
- [x] 7.2 用项目内一个真实老案例（如部从卡牌 TIPS 文档）人工跑一遍冷启动 + 增量流程，记录卡点
- [x] 7.3 用项目内一个全新假需求人工跑一遍 Phase 0 命中 + 冲突场景，验证咨询式输出与反驳通道有效（冲突段改为表格格式，R-Output-1 加入协议）
- [x] 7.4 跑一遍"用户撤销采用"场景，验证状态回滚与 Markdown 重写提议
- [x] 7.5 跑一遍"无 .interaction-sop 目录"场景，验证 SOP 静默退化为原版且零报错
