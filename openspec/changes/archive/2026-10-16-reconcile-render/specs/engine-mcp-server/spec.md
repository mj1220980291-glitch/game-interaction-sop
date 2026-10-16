## ADDED Requirements

### Requirement: render 工具支持同步模式参数

`render_v2_markdown_to_figma` 的输入 schema SHALL 新增：

- `target.rootId: string`：已渲染文档的 root 节点 ID，传入即进入同步模式
- `scope: string`：须匹配 `^\d{2}(\/\d+)?$`
- `dryRun: boolean`

没有 `target.rootId` 时如果传了 `scope` 或 `dryRun`，服务端 SHALL 返回 `INVALID_INPUT`，并且 SHALL NOT 调用渲染器。

输出 SHALL 新增 `mode: 'create' | 'reconcile'`。同步模式下 SHALL 额外返回 `changes`、`conflicts`、`preserved` 三个数组。

工具描述 SHALL 写明：重新渲染已有文档时应传 `rootId`；冲突不会被自动覆盖；`dryRun` 可用于预览。

原生工具集 SHALL 仍恰好为 `{validate_v2_markdown, render_v2_markdown_to_figma}`。

#### Scenario: 无 rootId 时传 scope
- **WHEN** 客户端传 `{ markdown, scope: "03" }`，没有 `target.rootId`
- **THEN** 服务端 SHALL 返回 `INVALID_INPUT`

#### Scenario: scope 格式非法
- **WHEN** 客户端传 `scope: "3"`
- **THEN** 服务端 SHALL 返回 `INVALID_INPUT`

#### Scenario: 同步模式返回冲突清单
- **WHEN** 客户端带 `target.rootId` 调用，且存在双方都改过的条目
- **THEN** 返回值 SHALL 含 `mode:'reconcile'` 和非空的 `conflicts`
