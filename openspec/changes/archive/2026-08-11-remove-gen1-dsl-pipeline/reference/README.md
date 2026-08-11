> **这是留档素材，不是活代码。** 一代 DSL 管道在删除前的关键快照（commit `4406ee7` 时点）。

## 一代是什么

`figma-interaction-doc-engine` 的第一版设计：**LLM 写 YAML DSL → 引擎渲染 Figma**。

原始设计文档见 `gen1-original-design.md`（来自旧仓库 `H:\kk8项目文件\openspec\changes\build-figma-interaction-doc-engine\`，从未归档）。核心动机（design.md 开头）：

> 布局规则全部寄存在 SKILL.md 文档里，由 LLM 在每次执行时即兴解释和遵守。继续在 SKILL 里堆规则，是把「形式系统的活儿」塞给「统计系统」。

思路是收窄 LLM 输出空间：从「任意 figma_execute JS」收窄到「合法的 YAML DSL」。

## 为什么被放弃

**不是思路错，是中间层多余。**

一代要求 LLM 在 YAML 里自己填 `anchor.nodeId` —— 也就是 LLM 必须先去 Figma 查节点 ID。这活儿它干不好，原设计 D6 已经埋了兜底（「锚点缺失节点 ID 时 planner 自动 capture_screenshot + get_selection 兜底解析」）。兜底本身就是信号：DSL 要求 LLM 提供它拿不到的信息。

二代想通：LLM 本来就要产出一份给人看的交互文档 Markdown。既然 Markdown 是必需品，YAML 就是纯多出来的一道翻译。于是引擎直接吃 Markdown，坐标改由引擎按模板 `1:14` 固定槽位算，`anchor` 概念整个消失。

`gen1-original-tasks.md` 第 10 章（验收）**7 项全部未打勾**，包括最关键的「端到端跑一遍 generate_interaction_doc，结果与人工流程对比 0 视觉缺陷」。这条流水线从未真正生成过一份 Figma 文档。

## 留了什么

| 文件 | 原路径 | 为什么留 |
|---|---|---|
| `checkpoint-index.ts.txt` | `src/checkpoint/index.ts` | **主要留档目标**，见下 |
| `pipeline.ts.txt` | `src/server/pipeline.ts` | 7-phase 编排与 checkpoint 的配合方式 |
| `executor-index.ts.txt` | `src/executor/index.ts` | backend 接口抽象与模板化执行边界 |
| `gen1-original-design.md` | 旧仓库 | 完整设计决策 D1-D9、风险、迁移计划 |
| `gen1-original-tasks.md` | 旧仓库 | 实施清单与未完成的验收项 |

## checkpoint 为什么值得留

**「phase 级可重入」是二代三代都没有的能力。**

当前 `render_v2_markdown_to_figma` 是一锤子买卖：中途失败只能整体 `triggerUndo` 重跑。一代的 `CheckpointStore` 提供了：

- 每 phase 落 `runs/<runId>/phase-N.json`，含 input hash、Figma 节点 ID 映射、执行日志
- hash 链 + drift detection —— 输入变了能检测出来，不会拿旧 checkpoint 续错
- `replay_from_checkpoint(runId, fromPhase)` 定点重入

如果将来要做「渲染到一半失败后从第 3 章继续」，或者「大文档分批渲染」，这套逻辑是现成参考。注意它是围绕一代的 7-phase 划分设计的，移植到 v2 需要重新定义 phase 边界（v2 的天然边界是 section）。

## 不留什么

`src/dsl/`（Zod schema）、`src/parser/`（md→DSL）、`src/planner/`（坐标/z-order/模板选择）、`src/templates/`（JS 模板字面量）未单独留档 —— 它们服务的是 YAML DSL 这个已废弃的格式，且其中真正的知识（坐标换算公式、GROUP bbox 爆炸防护、z-order 规则）**已经全部继承进 `src/v2/figma-client.ts` 与 `docs/figma-mcp-pitfalls.md`**，那份 pitfalls 文档本身就是一代踩坑踩出来的。

需要时从 git 历史取：`git show 4406ee7:packages/figma-mcp-server/src/planner/coords.ts`
