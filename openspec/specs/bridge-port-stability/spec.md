# bridge-port-stability Specification

## Purpose
TBD - created by archiving change bridge-port-stability. Update Purpose after archive.
## Requirements
### Requirement: 启动时保证首选 Bridge 端口可用

引擎 worker 在 spawn `figma-console-mcp` 子进程之前，SHALL 尝试让首选端口 `9223` 处于空闲状态。

若 `9223` 被占用，引擎 SHALL：

- 识别占用进程；仅当它同时满足「命令行含 `figma-console-mcp`」与「不是本进程的后代」时才连进程树一起结束
- 其他任何程序占用该端口时 SHALL NOT 结束它，只记录 stderr
- 结束成功后 SHALL 记录一行 `reclaimed preferred port 9223 from pid=<pid>` 日志

任一环节失败（命令不可用、解析为空、kill 失败）SHALL 降级为「保持现状并记录原因」，SHALL NOT 阻止引擎启动。

#### Scenario: 旧引擎残留占用首选端口
- **WHEN** 启动引擎时 `9223` 被一个命令行含 `figma-console-mcp` 的进程监听，且该进程不是本进程的后代
- **THEN** 引擎 SHALL 结束该进程树，并继续 spawn 子进程
- **AND** stderr SHALL 出现 `reclaimed preferred port 9223`

#### Scenario: 端口被无关程序占用
- **WHEN** `9223` 被一个命令行不含 `figma-console-mcp` 的进程监听
- **THEN** 引擎 SHALL NOT 结束该进程，SHALL 记录跳过原因并继续启动

#### Scenario: 端口空闲
- **WHEN** `9223` 上没有任何监听
- **THEN** 引擎 SHALL 直接 spawn，SHALL NOT 产生端口相关日志噪声

#### Scenario: 系统工具不可用
- **WHEN** `netstat` / `lsof` / `wmic` 任一不可用或输出无法解析
- **THEN** 引擎 SHALL 继续启动，仅记录降级原因

### Requirement: 端口占用解析可单测

监听进程解析与同类进程判定 SHALL 实现为纯函数（输入命令输出字符串，输出 pid / 布尔），以便在无 Figma 环境下回归。

#### Scenario: Windows netstat 解析
- **WHEN** 输入含 `TCP    0.0.0.0:9223    0.0.0.0:0    LISTENING    5052` 的行
- **THEN** 解析结果 SHALL 为 `[5052]`，不含非 LISTENING 行

#### Scenario: 命令行识别
- **WHEN** 命令行是 `node C:\...\node_modules\.bin\..\figma-console-mcp\dist\local.js` 或 `npx -y figma-console-mcp@latest`
- **THEN** 判定 SHALL 为同类进程
- **WHEN** 命令行是 `node server.js`（无关程序）
- **THEN** 判定 SHALL 为否

