## Context

`migrate-to-figma-console-mcp` 已经把工具链从 `cursor-talk-to-figma-mcp` 切到 `figma-console-mcp`，速度与原子性问题解决了。但烟雾测试期间反复出现的视觉问题（气泡被覆盖、坐标被误算成绝对值、配图块数对不上、标题带入「NN.」序号）暴露了一个结构性缺陷：**布局规则全部寄存在 SKILL.md 文档里**，由 LLM 在每次执行时即兴解释和遵守。

每补一条规则到 SKILL，文档就更长，但下一次仍可能违反——因为 LLM 的执行是概率性的，而坐标换算、z-order、模板选择是确定性问题。继续在 SKILL 里堆规则，是把"形式系统的活儿"塞给"统计系统"。

本设计的核心动作：把所有可形式化的规则下沉到 TypeScript 引擎，把 SKILL 收窄为「LLM 的输入输出协议说明」。

**Stakeholders**：
- 我（设计者 / 主要使用者，负责定 schema、读引擎报错）
- LLM（CodeMaker，新角色：纯解析器）
- figma-console-mcp（外部依赖，只透传 figma_execute）

**约束**：
- 不能要求 figma-console-mcp 修改任何代码（peer dependency）
- 必须能在不联网时跑单元测试（schema 与 planner 不依赖 Figma）
- Windows 本地开发，路径分隔符兼容

## Goals / Non-Goals

**Goals:**

1. **规则代码化**：z-order、坐标换算、配图块数对齐、标题清洗、模板选择全部进 TypeScript，有单测兜底。
2. **DSL 形式化**：用 Zod schema 描述交互文档，校验失败永远不进入 figma_execute，错误信息精确到字段。
3. **LLM 角色收窄**：LLM 的输出空间从「任意 figma_execute JS」收窄到「合法的 YAML DSL」，错误率随之指数下降。
4. **可重入**：每个 phase 落 checkpoint，单步失败可定点重试，不必从 phase 1 重跑。
5. **可观测**：每次生成产出 run report（DSL hash、planner output、figma_execute 调用链、截图清单），方便事后定责。
6. **最小迁移成本**：旧 SKILL 标记 deprecated 但保留可用，新流程通过新 MCP 工具入口暴露，并行试用 1-2 周再切默认。

**Non-Goals:**

- 不做通用 Figma 自动化框架，只服务于「交互文档生成」这一个垂直场景。
- 不替代 figma-console-mcp，仍然依赖它执行原子 JS。
- 不做 Figma 到 Markdown 的反向同步（双向同步不在本期）。
- 不做可视化 DSL 编辑器（YAML 文本即可）。
- 不做 CI 跑 Playwright（依赖 Figma 桌面登录态，初期仅本地烟雾）。

## Decisions

### D1 · 语言选择 TypeScript（strict）

**选择**：TypeScript 5.x + `tsconfig` strict + ESM only。

**为什么不是 Python**：figma-console-mcp 是 Node 生态，MCP SDK 官方主力在 TS / Python 双语并行，Node 端 Stdio Server 集成成本最低；DSL 类型与 Figma 节点 ID/box 模型同处 Node 运行时，避免跨语言序列化抖动。

**为什么不是 JS**：planner 的坐标计算与 schema 的字段约束依赖类型系统，strict 能在写代码阶段拦下 80% 的 typo / 漏字段。

### D2 · 仓库位置 — 独立目录

**选择**：与 `game-interaction-doc-kit` 同级新建 `figma-interaction-doc-engine/`，独立 package.json、独立发版节奏。

**替代方案**：放进 `game-interaction-doc-kit/engine/` 子目录。

**为什么独立**：kit 的定位是「skill + 模板资产包」（Markdown / 设计稿），engine 的定位是「可执行的 npm 包 + MCP server」。两者发版节奏、依赖体积、消费者不同（kit 给 SKILL 系统读，engine 给 MCP 客户端跑），耦合在一起会拖累 kit 的轻量性。

### D3 · DSL 用 YAML + Zod

**选择**：YAML 作为 DSL 文本格式，Zod 作为运行时 schema。

**为什么 YAML 不 JSON**：交互文档天然多行、含中文，YAML 的可读性远胜 JSON；Markdown 内嵌 YAML 块（```yaml）在 LLM 训练数据中极常见，token 成本最低。

**为什么 Zod 不 JSON Schema**：Zod 同时给出 TS 类型与运行时校验，单一事实源；错误信息可精细到 `bubbles[2].coord.x must be number`，比 JSON Schema 的 ajv 报错友好得多。

**Schema 顶层（草案）**：

```ts
const DocSchema = z.object({
  meta: z.object({ title, version, project, designUrl }),
  sections: z.array(SectionSchema),     // 01..NN
  designRefs: z.array(DesignRefSchema), // 设计稿节点引用
  screenshots: z.array(ScreenshotSchema)// 配图占位
});

const SectionSchema = z.object({
  index: z.number().int().positive(),
  title: z.string().regex(/^[^.0-9]/), // 禁止以 NN. 开头
  bubbles: z.array(BubbleSchema)
});

const BubbleSchema = z.object({
  id: z.string(),
  text: z.string(),
  anchor: AnchorSchema, // { nodeId } | { absXY } | { sectionRelXY }
  layer: z.literal('overlay') // 强制 z-order
});
```

### D4 · 分发形式 — MCP Stdio Server

**选择**：把引擎打包为 MCP Stdio Server，通过 `figma-interaction-doc-engine` 命令暴露。

**替代方案**：CLI（`figma-doc gen <file>`）。

**为什么 MCP**：CodeMaker 已经在用 MCP，新增一个 server 就能让 LLM 直接调用 `generate_interaction_doc(yaml)`，闭环不出 chat；CLI 则要 LLM 写 shell 命令，多一道翻译。

**对外工具**：

| 工具 | 入参 | 用途 |
|---|---|---|
| `validate_dsl` | yaml string | 仅校验，dry-run 友好 |
| `dry_run_layout` | yaml | 输出 planner 计算结果（坐标、克隆计划）但不调 figma_execute |
| `generate_interaction_doc` | yaml | 完整生成，落 checkpoint |
| `replay_from_checkpoint` | runId, fromPhase | 失败重入 |

### D5 · 与 figma-console-mcp 的关系 — 薄封装

**选择**：引擎进程内通过 stdio 子进程或同 host MCP 调用 `figma_execute`，**不 fork、不重写**。

**为什么**：figma-console-mcp 是上游已经稳定的工具，重写等于二次维护；薄封装层（`figma-executor` capability）只负责把 planner 输出的 JS 模板化拼装并执行，永远不直接生成 JS。

**调用边界**：所有进入 `figma_execute` 的 JS 都来自 engine 内部的预定义模板（template literal），LLM **不能**直接写 JS。

### D6 · 截图与气泡定位 — 引擎内置坐标

**选择**：所有坐标换算（FRAME-local 公式 `local = abs - parent.absoluteBoundingBox`）写进 `layout-planner`，AI 只提供语义锚点（如「右上角第二个按钮」+ 节点 ID）。

**保底**：如果 LLM 给出的锚点缺失节点 ID，planner 自动调用 `figma_capture_screenshot` + `figma_get_selection` 兜底解析。

### D7 · 错误恢复 — phase 级 checkpoint

**选择**：每个 phase 完成后写 `runs/<runId>/phase-<n>.json`，包含 input hash、figma 节点 ID 映射、执行日志。`replay_from_checkpoint` 从指定 phase 起步。

**Phase 划分**：
1. parse + validate（纯本地）
2. plan layout（纯本地，可 dry-run）
3. clone design template（figma_execute）
4. inject section frames（figma_execute）
5. inject bubbles（figma_execute）
6. inject screenshots（figma_execute）
7. final snapshot + report

### D8 · 测试 — Vitest + Playwright

**选择**：
- **Vitest**：parser、validator、planner 三个 capability 100% 单测覆盖；planner 用 fixture 驱动（YAML in → expected coord JSON out）。
- **Playwright + Figma desktop**：本地 E2E，每次 release 前手动跑一遍烟雾用例（部从卡牌、幻神槽位），截图 diff 容忍 1% 像素差。

**不在 CI 跑 Playwright** 的理由：Figma 桌面登录态、节点 ID 漂移、CI 沙盒无 GPU 渲染稳定性差。

### D9 · SKILL 处置 — v4 瘦身到 ~80 行

**选择**：v4 SKILL 改成「写 YAML 速查」，包含：
- DSL 顶层结构示例
- 5 个常见错误码对照
- 调用 `generate_interaction_doc` 的标准提示
- 一句话兜底：「如果引擎不可用，参见 v3 deprecated SKILL」

旧 v3 文档移到 `legacy/SKILL.v3.md` 保留。

## Risks / Trade-offs

- **DSL 早期变更频繁** → 引入 `meta.version` 字段，每次 breaking change 加 migration 脚本；初期 0.x 版本不承诺向后兼容。
- **LLM 写出半合法 YAML** → `validate_dsl` 永远先跑，错误信息要带「修正建议」（例如「title 不能以 `01.` 开头，请改为 `部从选中与入口`」）。
- **figma-console-mcp 升级断 API** → 在 `figma-executor` 层做 capability sniff，启动时 ping `figma_get_status` 做兼容性体检。
- **Playwright E2E 维护成本高** → 烟雾用例锁定 2 个固定项目，节点 ID 通过 fixture 固化，禁止依赖时间戳。
- **MCP 双 server 冲突**（engine + figma-console 同时跑） → 启动时检查 figma-console 进程，若未启则给出明确错误而非自启，避免 NPX 残留。
- **用户混淆新旧 SKILL** → v4 顶部加 `> 新工作流：调用 generate_interaction_doc。本文件仅作 YAML 编写参考。`

## Migration Plan

1. **Week 0（本周）**：完成本 change 全部 artifact，进入 implementation。
2. **Week 1**：搭起 engine 骨架（package、tsconfig、Zod schema、parser、planner 单测）；不接 figma_execute。
3. **Week 2**：接入 figma-executor + checkpoint，跑通部从卡牌烟雾用例。
4. **Week 3**：v4 SKILL 瘦身、写迁移指南、对接 CodeMaker MCP 配置。
5. **试运行 1-2 周**：新文档强制走引擎，老文档保留 v3 路径，收集 issue。
6. **回滚策略**：任意时刻可关闭 engine MCP，SKILL v3 deprecated 文档仍可用。

## Open Questions

1. `screenshots` 智能取舍的判断维度——是只看「图片数量 vs 章节数量」匹配，还是也要看图片内容标签？本期默认前者。
2. checkpoint 是否需要加密（含 Figma 节点 ID 不算敏感，但生成的 run report 可能含项目名）？默认明文，加 `.gitignore`。
3. DSL 是否需要支持 import / partial（多个 YAML 文件组合）？本期不做，单文件优先。
