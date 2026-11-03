## ADDED Requirements

### Requirement: Bridge 端口所有权可自愈且可读

引擎 SHALL 保证「渲染走的子进程」绑定 Figma 插件认可的端口（首选 9223）；发现子进程退到备用端口时，SHALL 主动清掉占用者并重拉子进程，而不是只写一行日志。

- 探测 SHALL 通过一次 `figma_get_status` 完成，解析 `port` / `preferredPort` / `portFallbackUsed`；
- 占用者 SHALL 只在被判定为 `figma-console` 同类进程时结束，其他程序占端口时 SHALL NOT 强杀；
- 重拉后 SHALL 最多轮询 3 次（每次 2s）确认端口回正；
- 无法回正时 SHALL 记录诊断，但 SHALL NOT 让 worker 退出（渲染失败 ≠ 进程该退）。

`figma_execute` 返回「Cannot connect」且存在端口回退时，引擎 SHALL 抛 `E_BRIDGE_PORT_CONFLICT`，message SHALL 含：实际端口、首选端口、占用者 pid、引擎 worker pid、supervisor pid、自动恢复结果、清理命令。

`get_skill_requirements` SHALL 在 `FIGMA_BACKEND=figma-console` 时返回 `bridge: { port, preferredPort, fallback, holderPid?, enginePid, supervisorPid?, recovery? }`，供验收方判断「测的是不是新进程 / 桥是否掉到备用端口」。

#### Scenario: 子进程退到备用端口

- **WHEN** worker 启动后 `figma_get_status` 报告 `portFallbackUsed: true`，端口 9224，9223 被 pid=51292 的 figma-console 占用
- **THEN** 引擎 SHALL 结束 pid=51292、重拉子进程，并在 6s 内确认端口回到 9223；期间 SHALL 在 stderr 记录 `bridge recovery`

#### Scenario: 占用者不是同类进程

- **WHEN** 9223 被其它软件监听（命令行不含 figma-console）
- **THEN** 引擎 SHALL NOT 结束该进程，`bridge.recovery` SHALL 说明「未强杀」，渲染报错 SHALL 给出清理指引

#### Scenario: 验收判断新进程

- **WHEN** 验收方调用 `get_skill_requirements`
- **THEN** 返回体 SHALL 含 `bridge.enginePid` 与 `bridge.fallback`；`fallback: true` 时验收方 SHALL 判定 render 不可用与几何修复无关

### Requirement: supervisor SHALL 单例

同一 MCP 配置 SHALL 只允许一份 supervisor。启动时若锁文件（`~/.game-interaction-sop/supervisor.lock`）里的 pid 存活且不是自己，新进程 SHALL 让位退出（exit 0），SHALL NOT 双活。

锁文件内容 SHALL 至少含 `{ pid, startedAt }`；pid 已死或文件损坏时 SHALL 直接覆盖，不阻断启动。

#### Scenario: 第二份 supervisor 让位

- **WHEN** 已有 supervisor（pid=49544）在跑，宿主又拉起一份
- **THEN** 新进程 SHALL 打印让位原因并退出，工具调用 SHALL 仍落在唯一那份上

#### Scenario: 旧锁残留

- **WHEN** 锁文件里的 pid 早已退出
- **THEN** 新进程 SHALL 覆盖锁并正常启动
