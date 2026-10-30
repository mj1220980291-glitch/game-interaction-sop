## Context

Bridge 端口范围 `9223–9232`，首选 `9223`。端口由 `figma-console-mcp`（我们 spawn 的 node 子进程）绑定，不由引擎自己绑。Figma 插件启动时扫一遍端口，之后不再重扫——所以「端口漂移」意味着插件永久失联。

今天的现场：

| 观察 | 含义 |
|---|---|
| `figma_get_status` → `port: 9224, portFallbackUsed: true` | 新子进程没抢到 9223 |
| `otherInstances: [{ port: 9223, pid: 5052 }]` | 旧实例还活着，占着首选端口 |
| `figma_execute` 报 `Cannot connect … ws://localhost:9223` | 工具走的是首选端口，而插件连在 9224 |

`reclaimOrphanedBridgePorts()` 的孤儿判据是「父进程不存在」。旧实例的父链（cmd.exe → npx）还活着，于是被判为「有活父进程」跳过。

## Goals / Non-Goals

**Goals**

- 启动时首选端口可用（能抢就抢），抢不到要留下可诊断的日志
- 只杀确定的同类进程，绝不误伤其他 node 服务

**Non-Goals**

- 不改 figma-console-mcp 自身，不改插件
- 不做「运行中动态迁移端口」
- 不解决「用户在 CodeMaker 里同时配置了两个 figma-console MCP」的配置错误（仍只告警）

## Decisions

### D1 判据：同类 + 非后代

启动顺序保证：调用发生在 spawn 自己子进程之前。因此任何此刻占用 `9223`、命令行含 `figma-console-mcp` 的进程都不可能是我们的后代，只可能是旧引擎的残留或用户另配的实例——两者都会抢走插件连接，杀掉是正确行为。

**替代方案：按启动时间判断**。需要 `wmic` 的 CreationDate 且跨时区解析，收益不明显，否决。

**替代方案：只告警不杀**。今天的代价是四次人工重启，告警已被证明不够。

### D2 端口占用者解析

- Windows：`netstat -ano -p TCP` 输出里 `LISTENING` 行 → 取末列 PID
- POSIX：`lsof -nP -iTCP:<port> -sTCP:LISTEN -t`
- 命令行识别：Windows `wmic process where processid=<pid> get CommandLine /format:csv`；POSIX `ps -o command= -p <pid>`
- 只认命令行同时含 `figma-console` 与 `mcp` 的进程（容错 `figma-console-mcp@latest` / 路径形式）

解析函数保持纯函数（输入字符串 → pid 列表），便于单测。

### D3 失败一律降级

`netstat`/`lsof`/`wmic` 任一不可用、解析空、kill 失败 → 记一行 stderr 后继续 spawn。端口问题不能让引擎起不来。

### D4 等端口真的可绑定再 spawn

杀掉旧实例不等于端口可用：它和插件之间的已建立连接关闭后进入 `TIME_WAIT`，Windows 上新监听器 `EADDRINUSE`，子进程于是退回 9224——第一版修复后真机就是这样又漂了一次。用一次真实 `listen` 探测（最多等 5s）代替只看 netstat（netstat 看不见 TIME_WAIT 的阻碍）。

### D5 本变更不解决的部分

worker 换人时子进程随之退出，插件的 WebSocket 必然断开，而插件只在**启动时**扫端口、不自动重连——所以「build 之后仍要重开一次插件」这一步消不掉。本变更保证的是：

- 重开插件一定连到当前引擎（端口固定 9223，不会连到僵尸）
- 不会再出现「probe 说 9224、execute 打 9223」的工具错乱

要彻底免掉重开插件，需要让 figma-console 子进程独立于 worker 存活（sidecar 常驻），那是另一个变更。

## Risks / Trade-offs

- [误杀用户另配的 figma-console 实例] → 判据限定同类进程；日志打印被杀的 pid 与端口，便于追查；文档里写明「同时配置两个 figma-console 不受支持」
- [netstat 输出格式差异（本地化/权限）] → 解析容错：只取 `LISTENING` 行末列数字；解析不到就当无占用
- [POSIX 无 lsof] → 降级为「只回收孤儿」，行为与今天一致

## Migration Plan

无数据迁移。发版后第一次重启引擎即生效；验证方式：手动留一个旧实例占 9223，重启引擎，日志出现 `reclaimed preferred port 9223`，`figma_get_status` 端口为 9223 且 `portFallbackUsed: false`。
