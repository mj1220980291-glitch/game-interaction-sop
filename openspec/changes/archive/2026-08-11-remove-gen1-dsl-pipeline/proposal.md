## Why

`packages/figma-mcp-server` 里并存两代管道，彼此零交叉依赖：

- **一代（YAML DSL）**：`src/{dsl,parser,planner,executor,checkpoint,templates}` + 4 个 MCP 工具（`validate_dsl` / `dry_run_layout` / `generate_interaction_doc` / `replay_from_checkpoint`）
- **三代（v2 Markdown，在跑）**：`src/v2/` + 2 个 MCP 工具（`validate_v2_markdown` / `render_v2_markdown_to_figma`）

一代要求 LLM 自己在 YAML 里填 `anchor.nodeId`，而这信息 LLM 拿不到；二代改让引擎吃 Markdown、坐标由模板槽位决定后，一代整条链失去意义。其原始 tasks 第 10 章（验收）7 项全空——**从未通过端到端验收**，也从未被任何 skill phase 调用。

保留成本是实打实的：

- 6 个源码目录、4 个对外 MCP 工具
- 88 个测试（占全量 142 的 62%），全绿但保护的是没人用的代码，制造虚假安全感
- MCP 工具列表 6 个里 4 个是噪音，增加 LLM 选错工具的概率
- `figma-mcp-server/README.md` 至今按一代描述自己，误导所有读者

## What Changes

- 删除 `src/dsl/`、`src/parser/`、`src/planner/`、`src/executor/`、`src/checkpoint/`、`src/templates/`
- 删除 `src/server/pipeline.ts`；`createServer.ts` 移除 4 个一代工具注册与相关 import
- 删除对应测试：`dsl-validate` / `parser-markdown` / `planner-units` / `planner-fixtures` / `executor` / `checkpoint` / `pipeline` / `lint-templates`，以及 `tests/fixtures/`
- `server.spec.ts` 移除一代工具断言，工具清单期望改为 2 个
- `proxy.spec.ts` 两处把样本工具名 `validate_dsl` 换成 `validate_v2_markdown`（仅作命名冲突/路由样本，与一代无关）
- `package.json` 移除 `lint:templates` 脚本；评估 `js-yaml` / `zod` / `playwright` 是否仍被依赖
- 重写 `packages/figma-mcp-server/README.md`，按三代实际形态描述

checkpoint / pipeline / executor 的实现与一代原始设计文档已留档至 `reference/`，`replay_from_checkpoint` 所代表的「phase 级可重入」能力将来若要在 v2 上重建，以此为参考。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `engine-mcp-server`：对外 MCP 工具从 6 个收敛为 2 个（外加代理转发的 figma-console 工具）

### Removed Capabilities

以下 capability 随一代管道移除。它们的 spec 存在于旧仓库 `H:\kk8项目文件\openspec\changes\build-figma-interaction-doc-engine\specs\`，从未同步进本仓库 `openspec/specs/`，因此本仓库无需删除 spec 文件：

- `interaction-doc-dsl`、`dsl-parser`、`layout-planner`、`figma-executor`、`engine-checkpoint`、`engine-test-harness`

## Impact

- **BREAKING**：任何直接调用 `validate_dsl` / `dry_run_layout` / `generate_interaction_doc` / `replay_from_checkpoint` 的外部集成将失效。经确认 `packages/skill` 全部 phase 均未调用这 4 个工具，SOP 流程不受影响。
- 测试数量预期从 142 降至约 54，全部为三代实际在跑的路径
- 不触碰 `src/v2/`、`src/server/{createServer 的 v2 部分,figmaConsoleBackend,detectExternal,index}`、proxy 转发逻辑
- 不含 `####` 的既有文档渲染行为必须逐字节不变
