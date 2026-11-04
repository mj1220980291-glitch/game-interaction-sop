## ADDED Requirements

### Requirement: 渲染开写前 SHALL 探活（默认开启）

`render_v2_markdown_to_figma` 在绑定目标文件之后、第一笔写操作之前 SHALL 执行一次插件回环探活。

探活默认开启，仅当 `GISOP_PREFLIGHT=0` 时关闭。探活失败 SHALL 以 5×3s 重试吸收切文件抖动；重试后仍失败 SHALL 返回 `V2_BRIDGE_DOWN` 并携带 `bridge` 快照，SHALL NOT 进入写路径。

#### Scenario: 插件 sandbox 假死

- **WHEN** 目标文件已绑定、探活连续失败
- **THEN** 渲染 SHALL 返回 `ok:false` + `V2_BRIDGE_DOWN`，SHALL NOT 调用 `commitUndoCheckpoint` 或任何写节点调用

#### Scenario: 探活在重试窗口内恢复

- **WHEN** 第一次探活失败、第三次探活成功
- **THEN** 渲染 SHALL 继续正常执行，SHALL NOT 返回错误

### Requirement: 渲染返回体 SHALL 携带 bridge 快照

`render_v2_markdown_to_figma` 的返回体 SHALL 含 `bridge` 字段（成功与失败都给），字段：

`port`、`preferredPort`、`fallback`、`holderPid`、`pluginConnected`、`lastRoundtripMs`、`enginePid`、`supervisorPid`。

`enginePid` 语义 SHALL 在工具描述中写明：值为 worker 进程 pid；**它在多次调用间变化表示宿主重启了整个 MCP 服务**，不代表 worker 正常 swap。

#### Scenario: 渲染失败的返回体

- **WHEN** 渲染因桥故障失败
- **THEN** 返回体 SHALL 含 `bridge.port` / `bridge.pluginConnected` / `bridge.enginePid`，使调用方无需 netstat 即可定性

#### Scenario: 渲染成功的返回体

- **WHEN** 渲染成功
- **THEN** 返回体 SHALL 含同一组 `bridge` 字段，且 `lastRoundtripMs` 为本次探活耗时

### Requirement: 插件无回程 SHALL 使用专属错误码

当写操作因插件无回程超时，渲染 SHALL 返回 `V2_BRIDGE_NO_REPLY`，message SHALL 含端口、worker pid、supervisor pid 与建议动作（关掉并重开插件）；SHALL NOT 复用 `V2_RENDER_RUNTIME_ERROR`。

#### Scenario: 假死下的渲染

- **WHEN** 探活通过但第一笔写操作 20s 内无回程
- **THEN** 返回 SHALL 为 `V2_BRIDGE_NO_REPLY`，message 含「关掉重开插件」；`warnings` SHALL 说明已产生的副作用（若有）
