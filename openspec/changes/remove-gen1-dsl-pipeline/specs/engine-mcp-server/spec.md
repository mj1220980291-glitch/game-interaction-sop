## MODIFIED Requirements

### Requirement: 引擎对外工具集

MCP Server `figma-interaction-doc-engine` SHALL 只暴露 v2 Markdown 管道所需的原生工具，外加从 figma-console-mcp 代理转发的全部工具。

原生工具集 SHALL 恰好为：

| 工具 | 是否需要 Figma 后端 | 用途 |
|---|---|---|
| `validate_v2_markdown` | 否 | 校验 v2 Markdown，返回 `ok/errors/warnings/ir` |
| `render_v2_markdown_to_figma` | 是 | 按 v2 Markdown 填充模板 1:14 |

已废弃的一代 YAML DSL 工具（`validate_dsl`、`dry_run_layout`、`generate_interaction_doc`、`replay_from_checkpoint`）SHALL NOT 出现在工具列表中。

#### Scenario: tools/list 只返回两个原生工具

- **WHEN** 客户端请求 `tools/list` 且未配置任何 proxyTools
- **THEN** 返回的工具名集合 SHALL 恰好为 `{validate_v2_markdown, render_v2_markdown_to_figma}`

#### Scenario: 调用已移除的一代工具返回未知工具错误

- **WHEN** 客户端调用 `tools/call` 且 `name` 为 `generate_interaction_doc`
- **THEN** 服务端 SHALL 返回未知工具错误，且 SHALL NOT 尝试转发给 proxyClient

#### Scenario: 代理工具与原生工具的命名冲突守卫仍生效

- **WHEN** proxyTools 中存在名为 `validate_v2_markdown` 的工具
- **THEN** 服务端 SHALL 在 stderr 输出含 `tool name collision` 与该工具名的诊断信息，并以退出码 1 终止进程
