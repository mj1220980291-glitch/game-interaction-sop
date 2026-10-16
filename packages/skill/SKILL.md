---
name: game-interaction-sop
description: "游戏交互需求 → 交互文档的完整 SOP。使用场景：用户给一份策划文档（任意格式）/截图/口头需求，希望产出可交付的游戏交互文档，最终落到 Figma 模板内。本 skill 串联四个阶段：(1)需求挖掘 (2)v2 Markdown 生成 (3)索要设计稿 (4)调引擎写入 Figma。覆盖关键词：梳理/分析/拆解/澄清/理解 游戏交互需求；输出/生成/整理/写入 交互文档；按模板输出；战斗/准备/商店/卡牌/资源/状态/反馈 交互需求。"
---

# Game Interaction SOP

游戏交互需求挖掘 → 交付级 Figma 交互文档的端到端 SOP。

## 何时启用本 skill

用户给出以下任一信号时启用：

- 给一份策划文档/UI 截图/语义模糊的功能需求，请你"梳理 / 分析 / 拆解 / 理解 / 看看这个需求"
- 要求"输出/生成/整理/写入 交互文档"
- 要求"按模板输出"或"写到 Figma 交互稿"

---

## 完整 SOP（4 个 Phase + 2 个辅助阶段）

```
[Phase 0 — 翻库咨询（内嵌，不独立成回合）]
   启动检查 → 读项目模式库 → 检索命中 → 对比新需求 → 嵌入 Phase 1 第一回合
   无模式库时静默退化，Phase 1 行为与旧版完全一致
   细则：phases/phase0-recall.md
        ↓（嵌入）
[Phase 1 — 需求挖掘]
   入场材料识别（路径A 图先行 / 路径B 策划文档先行可提议画草稿）
   读策划文档 → 复述理解 → 翻库咨询结果（若有）→ 1-3 问/轮 → 直到信息可用
   细则：phases/phase1-analysis.md
        ↓
[Phase 2 — v2 Markdown]
   先做分类决策（界面清单锚定图清单 → 模块清单 → 规则归位+丢弃清单 → 用户确认）
   再按 v2 格式产出 Markdown → 用户审核 → 用户确认 → 保存到磁盘
   细则：phases/phase2-markdown.md（含 Step 0 分类决策必经路径）
   规范：references/markdown-v2-spec.md（含转写文体规范 T1–T5）
        ↓
[Phase 3 — 索要设计稿]
   路径A：入场图已在手 → 确认可作主图 / 补高清图 / 跳过
   路径B：主动问用户 图片 / Figma 链接 / 跳过
   细则：phases/phase3-asset.md
        ↓
[Phase 4 — 写 Figma]
   调用 figma-interaction-doc-engine 工具按 v2 Markdown 填充模板 1:14
   细则：phases/phase4-figma.md
   模板映射：references/template-1-14.md
   角色色板：references/role-tags.md
        ↓
[Phase 5 — 模式库维护（增量，默认自动触发）]
   Phase 4 完成后按风险分级维护项目模式库
   显式触发时：冷启动批量提取（扫历史交互文档建库）
   细则：phases/phase5-extract.md
   Schema：references/pattern-schema.md / index-schema.md / deviation-schema.md
```

---

## Phase 切换规则（必读）

每个 Phase 都有**进入条件**和**完成条件**。LLM 必须显式告诉用户当前在哪一 Phase，不要默默推进。

| Phase | 进入条件 | 完成条件 | 失败回退 |
|---|---|---|---|
| 0. 翻库（内嵌） | Phase 1 启动时自动执行 | 检索完成（无论命中与否），输出嵌入 Phase 1 | 无库 / 低分 → 静默退化 |
| 1. 分析 | 用户给出需求材料（**入场材料识别**：路径A 图先行 / 路径B 策划文档先行可提议画草稿） | 4 维度全满（可调参数 / 差异领域 / 业务专属 / 冲突清零）；路径已确定 | 缺关键决策或冲突未决 → 继续 Q&A |
| 2. Markdown | Phase 1 完成 | 用户确认"可以保存"，文件写入磁盘；**Step 0.1 界面清单锚定图清单（一图一章，禁流程章）** | Markdown 不通过 v2 强校验 → 修正后重输 |
| 3. 索要设计稿 | Phase 2 已保存 | 路径A：入场图确认可作主图 / 补高清图 / 显式跳过；路径B：用户提供链接/图片，或显式说"跳过" | 用户暂时没有 → 用占位走 Phase 4，后续再补 |
| 4. 写 Figma | Phase 3 完成 | 引擎返回成功，用户在 Figma 看到结果 | 引擎报错 → 修正 Markdown 或设计稿后重跑 |
| 5. 维护库（增量） | Phase 4 完成后默认触发 | 增量操作完成（含日志写入）或用户跳过 | 写盘失败 → 暂停等用户处理 |

**严禁跨 Phase**：Phase 1 没完不准产出 Markdown；Markdown 没保存不准要设计稿；设计稿没拿到（或显式跳过）不准调引擎。

---

## 全局原则（贯穿所有 Phase）

### Anti-Contamination

- 不要把过往任务（卡牌/资源/战斗）的设定带进新需求
- 不要预设需求类型，用现实输入分类
- 仅当输入支持时再做推断

### 提问纪律

- 每轮 ≤ 3 个问题；问最影响交互文档落地的问题
- 用户答完后先把答案变成`已确认`再继续问
- 已被模式骨架锁定的决策不再重复追问
- 问够即停，不追求穷尽

### 项目库优先

- Phase 1 开口前先执行 Phase 0 检索，见 `phases/phase0-recall.md`
- 项目库（`.interaction-sop/`）的内容完全由项目方维护，skill 仓库只携带 schema 与流程协议，不携带任何具体模式数据
- 无项目库时 SOP 退化为原版，零负担，零报错

### 一句话主义

- 引擎能做的事不写在 skill 里
- Figma MCP 的坐标系/auto-layout 陷阱、Group bbox 爆炸、撤销栈风险等技术细节**全部由 figma-interaction-doc-engine 处理**
- 本 skill 仅描述"做什么"，不描述"怎么调 MCP"
- 项目库的具体内容（模式、偏离、术语）不归 skill 管，仅由 schema 约束格式

---

## 输出契约

| Phase | 输出物 | 落地位置 |
|---|---|---|
| 0 | 无独立输出（嵌入 Phase 1 第一回合） | 仅对话 |
| 1 | 入场路径判定（A 图先行 / B 策划文档先行）+ 对话内的`已确认 / 待确认`列表 | 仅对话 |
| 2 | v2 Markdown 文件 | 默认与策划文档同目录，`[需求名]_交互文档.md` |
| 3 | 路径A：入场图确认/补高清图/"跳过"；路径B：用户提供的图片/链接/"跳过" | 仅 Phase 4 输入 |
| 4 | Figma 文档 | file `UYCJok3MXTWITMfeJSqEF6` 内新克隆的"模板"实例 |
| 5 | 模式文件 / 索引更新 / 偏离记录 / 维护日志 | `.interaction-sop/patterns/*.md` / `index.md` / `deviations.md` / `maintenance.log` |

---

## 文件索引

**Phase 文件**（按 SOP 顺序阅读）：
- `phases/phase0-recall.md` — 翻库咨询：8 步检索流程、打分公式、输出模板、退化路径
- `phases/phase1-analysis.md` — 需求挖掘细则、**入场材料识别（双入口）**、提问类型、分类法、采用契约、撤销机制
- `phases/phase2-markdown.md` — v2 Markdown 生成、保存、强校验；**Step 0 分类决策（界面清单锚定图、规则归位+丢弃清单）**
- `phases/phase3-asset.md` — 索要设计稿的话术与边界；**路径A 退化模式（入场图已在手）**
- `phases/phase4-figma.md` — 调用 `figma-interaction-doc-engine` 的契约
- `phases/phase5-extract.md` — 模式库冷启动提取、增量维护、9 条硬规则、用户 override

**规范文件**（需要细节时查阅）：
- `references/markdown-v2-spec.md` — v2 格式权威规范（机器可读契约 + **转写文体规范 T1–T5**）
- `references/pattern-schema.md` — 项目模式条目格式契约（schema_version: 1）
- `references/index-schema.md` — 项目库索引文件格式契约（含 glossary）
- `references/deviation-schema.md` — 规范偏离记录格式契约
- `references/template-1-14.md` — Figma 模板节点 ID 映射表
- `references/role-tags.md` — 7 角色定义、颜色、模板节点对应

阅读顺序建议：先读本 SKILL.md → 进入对应 Phase 时读对应 phase 文件 → 需要细节时查 references。

