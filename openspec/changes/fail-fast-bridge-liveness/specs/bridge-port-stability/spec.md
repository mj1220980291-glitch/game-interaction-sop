## ADDED Requirements

### Requirement: 活链判定 SHALL 以插件回环往返为准

引擎判定「Bridge 可用」时，SHALL 以一次插件回环往返（`figma_execute` 执行 `return 1;`，超时 5s）为判据，SHALL NOT 以 WebSocket socket 是否建立为判据。

判据失败时 SHALL 区分两种成因并在诊断中写明：

| 成因 | 判据 |
|---|---|
| 插件未接入 | 子进程没有任何插件客户端连接 |
| 插件 sandbox 假死 | socket 已建立、回环无响应 |

#### Scenario: socket 在、回环无响应

- **WHEN** 插件 WebSocket 已 established，但探活 `return 1;` 在 5s 内无响应
- **THEN** 引擎 SHALL 判定为 sandbox 假死，诊断 SHALL 含「关掉重开插件」指引与 worker / supervisor pid

#### Scenario: 回环正常

- **WHEN** 探活 `return 1;` 在 5s 内返回
- **THEN** 引擎 SHALL 记为活链，并记录本次往返耗时

### Requirement: 单次 exec SHALL 有客户端侧超时

引擎对 `figma_execute` 的每次调用 SHALL 在客户端侧设上限：默认 `插件 timeout + 5000ms`，可由 `GISOP_EXEC_TIMEOUT_MS` 覆盖。

超时后 SHALL 返回错误码 `V2_BRIDGE_NO_REPLY`，message SHALL 含端口、worker pid、supervisor pid 与实际预算；SHALL NOT 继续等待子进程返回。

#### Scenario: 插件沙箱假死

- **WHEN** `figma_execute` 已发出但插件始终不响应
- **THEN** 引擎 SHALL 在 ≤20s（默认预算）内抛出 `V2_BRIDGE_NO_REPLY`，SHALL NOT 等到宿主请求超时（60s）

#### Scenario: 正常慢写

- **WHEN** 一次批量写耗时 12s（小于插件 timeout 15s）
- **THEN** 调用 SHALL 正常返回，SHALL NOT 触发客户端侧超时

### Requirement: 桥故障诊断 SHALL 覆盖第三种状态

`describeBridgeFailure` 在原有「退到非首选端口」「首选端口被占」之外，SHALL 覆盖第三种状态：端口仍为首选、无占用者、但插件无回环。

第三种状态的诊断 SHALL 含端口、worker pid、supervisor pid 与「sandbox 可能已死」的判定，SHALL NOT 返回空。

#### Scenario: 端口正确但插件假死

- **WHEN** `port === preferredPort`、`fallback === false`、`holderPid === undefined`，探活失败
- **THEN** 诊断 SHALL 非空，且明确指向「插件 sandbox 假死 → 关掉重开插件」

#### Scenario: 插件未打开

- **WHEN** 子进程无任何插件客户端连接
- **THEN** 诊断 SHALL 指向「插件未打开」，SHALL NOT 报成 sandbox 假死
