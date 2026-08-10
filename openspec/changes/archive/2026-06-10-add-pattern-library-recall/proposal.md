## Why

当前 SOP 在 Phase 1（需求挖掘）阶段每次都从零开始提问，不会主动检索项目内已有的设计决策与交互模式，导致：

- **重复造轮子**：相似需求每次都要把"选中怎么处理 / TIPS 怎么布局 / 弹窗能否跳过"重新问一遍
- **抗污染能力弱**：策划文档里可能带有与项目规范冲突的随手描述，Agent 无能力识别，按字面照搬
- **设计经验难沉淀**：每个项目积累的交互模式停留在散落的交互文档里，无法被下次需求复用

本次改造引入"项目级模式库"机制：让 SOP 在 Phase 1 提问前先翻阅项目库，命中已有模式时以**咨询式建议**呈现（不是机械的 yes/no 查询），未命中时静默退化到原流程。模式库由 Agent 在用户授权下从历史交互文档批量提取，并在每次需求完成后按风险分级自动维护。

## What Changes

- **新增 Phase 0 — 翻库咨询（recall）**：在 Phase 1 第一回合开口前内部完成检索 + 对比，输出嵌入 Phase 1 第一回合，呈现"哪些可复用 / 哪些要单独定 / 与项目规范的冲突点"。命中即在会话内注入"采用契约"，跨 Phase 持续生效，用户可自然语言撤销。
- **新增 Phase 5 — 模式库提取与维护（extract）**：
  - 冷启动：用户授权后扫历史交互文档，分批聚类 → 用户 review → 落盘
  - 增量：每次 Phase 4 后按风险分级处理（数据追加全自动 / 立新模式轻确认 / 结构性变更需 review）
  - 所有自动操作写入 `maintenance.log`，用户可随时按日志回滚
- **修改 Phase 1**：第一回合标准结构改为命中/未命中两套模板；后续轮的"已确认"列表显示模式注入的骨架；完成度评估新增"未决冲突必须清零"维度；支持中途撤销采用
- **新增 Schema 契约**：模式（pattern）/ 索引（index，含 glossary）/ 偏离（deviation）三套格式，由 skill 仓库定义、项目仓库填充
- **跨项目分发协议**：skill 仓库只携带 schema + 流程协议；项目仓库自带 `.interaction-sop/` 目录，缺失时 SOP 静默退化为原版（零负担）
- **首期不实现 decision schema**：留 ID 命名空间与 schema_version 接口，未来跨模式铁律明确后再引入

## Capabilities

### New Capabilities

- `project-pattern-library`: 项目级模式库的格式契约（pattern / index / deviation 三种 schema 及其字段语义、关系、演进规则）。此 capability 描述"项目侧产出物的结构契约"，与 SOP workflow 解耦。

### Modified Capabilities

- `skill-sop-workflow`: 新增 Phase 0（recall）与 Phase 5（extract）阶段定义；Phase 1 行为修订（命中模式后的输出模板、采用契约的跨 Phase 注入、完成度重算、撤销机制、未决冲突阻断推进）。

## Impact

- **skill 仓库新增文件**：
  - `packages/skill/phases/phase0-recall.md`
  - `packages/skill/phases/phase5-extract.md`
  - `packages/skill/references/pattern-schema.md`
  - `packages/skill/references/index-schema.md`
  - `packages/skill/references/deviation-schema.md`
- **skill 仓库修改文件**：
  - `packages/skill/SKILL.md`（Phase 索引、切换规则、输出契约）
  - `packages/skill/phases/phase1-analysis.md`（第一/后续回合结构、完成度评估、撤销处理）
- **用户项目侧**：新增可选的 `.interaction-sop/` 目录结构（index.md / patterns/ / deviations.md / maintenance.log）。无此目录时 SOP 行为与改造前完全一致，零迁移成本。
- **OpenSpec specs**：新增 `project-pattern-library` capability，修改 `skill-sop-workflow` capability。
- **下游工具**：figma-interaction-doc-engine 与 markdown-v2-contract 不受影响。Markdown 中可能新增"偏离 P-XXX：xxx"标注，属注释性文本，不破坏 v2 校验。
- **不涉及**：引擎层改动、Figma 模板变更、跨平台适配规则。
