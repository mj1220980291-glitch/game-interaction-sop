## 上下文

`figma-console-mcp` 的连接判据是 `wsServer.isClientConnected()`：插件 `ui.html` 的 WebSocket 还挂着就返回 true，**沙箱（code.js）是否可执行完全看不出**。sandbox 假死的典型来源：上一次长脚本把它顶死、宿主自愈重启时旧桥被树杀、Figma 侧脚本异常未 return。

现有代码对「假死」没有任何防线：

- `healthCheck()` 实现是对的（`run('return 1;', 5000)`，真回环），但门控在 `GISOP_PREFLIGHT === '1'`（默认关），且注释记录过一次误报
- `exec()` 把 `timeout` 交给插件侧，自己不设上限：插件不回复时，`client.callTool` 挂到 figma-console 的连接层超时（实测 60s），正好等于宿主自愈阈值
- `describeBridgeFailure` 只在 `fallback || holderPid` 时给诊断，「端口正确、插件假死」落到 `return undefined`

## 决策

### 1. 活链判据 = 一次 5s 回环，而不是 socket 状态

探活沿用已有 `healthCheck()`：`figma_execute('return 1;', timeout=5000)`。理由：

- 这是唯一能同时覆盖「插件没开」「socket 假死」「sandbox 顶死」的判据
- 成本 1 次往返（<100ms 正常态），远比 60s 干等划算

对 2026-10-30 那次误报的处理不是关掉它，而是**重试窗口**：切目标文件后第一次定向调用会抖一次，用现有 `retryTransient` 5×3s（合计 ≤15s）吸收。窗口内失败才算桥断。

### 2. 门控翻转：默认开

`GISOP_PREFLIGHT=1` 改为 `GISOP_PREFLIGHT!=0`（默认开，显式 `0` 才关）。理由：默认关的代价是「用户拿到一句误导性错误 + 整轮 60s + 宿主重启 MCP」，默认开的代价是「异常态多花 ≤15s」。后者可逆，前者不可逆。

### 3. 客户端侧 exec 超时 = 插件 timeout + 5s

在 `exec()` 外面套一层 race：

```
const budget = Number(process.env.GISOP_EXEC_TIMEOUT_MS ?? timeout + 5000)
Promise.race([client.callTool(...), sleep(budget).then(() => { throw NoReplyError })])
```

- 插件侧仍是 15s 默认（业务语义不变），客户端只负责「插件根本不回来」这一种
- 超时错误码 `V2_BRIDGE_NO_REPLY`，message 带 `port / workerPid / supervisorPid / budget`
- 为什么不用 `retryTransient` 硬扛：假死状态下重试只会把 20s 变 60s，重新撞回宿主阈值

### 4. 诊断分三态

| 状态 | 判据 | 输出 |
|---|---|---|
| 退到非首选端口 | `fallback === true` | 现状：实际端口 + 占用者 pid + 清理指引 |
| 首选端口被占 | `holderPid !== undefined` | 现状同上 |
| **端口正确、插件无回程**（新增） | `port === preferredPort && !fallback && holderPid === undefined` | `桥在 9223 但没有插件回环（探活 5s 无响应）；插件 sandbox 可能已死 → 关掉重开插件` + worker/supervisor pid |

第三态必须与「插件根本没打开」区分：后者探活同样失败，但 `pluginConnected === false` 时 message 走「请打开插件」。

### 5. `bridge` 快照进返回体

`RenderResult` 增加 `bridge`（只读快照）。回执方判断顺序变成：`bridge.fallback` → 端口问题；`bridge.pluginConnected === false` → 插件没连；`lastRoundtripMs` 有值但 render 仍失败 → 不是桥的问题，去查模板/md。

`enginePid` 继续保留，但文档要写明：**它变 = 宿主重启了整个 MCP**，不是 worker swap。

### 6. worker boot 后的重连窗口

worker 在 `v2Backend` 装配完成后做一次探活，失败则按 2s 间隔最多等 20s（`worker.ts` 已有注释：「worker 换了以后插件要 20s 上下才重连完」）。这一步把「宿主重启后的第一个请求必挂」消掉。

### 7. 不做的事

- **不默认打开 `GISOP_BRIDGE_HOST`**：常驻桥宿主的边角失败面（9222 被占、Windows spawn npx 要 shell）尚未收干净，开关继续收着
- **不改宿主 60s 自愈阈值**：那是 CodeMaker 侧行为，改不了；策略是「在它之前失败」
- **不把 render 拆成多次调用**：本次失败不是「render 太慢」，是「一次写操作没有回程」，拆分不解决问题

## 风险

| 风险 | 缓解 |
|---|---|
| 探活默认开后，正常渲染多花 1 次往返 | 单次 <100ms；仅 render 入口一次，不逐节点 |
| 切文件后抖动被探活拦下 | 5×3s 重试窗口；窗口内成功即继续 |
| 客户端 race 超时误杀「大节点批量写」 | budget 默认 `timeout+5s`（15s+5s=20s），且 `GISOP_EXEC_TIMEOUT_MS` 可调；批量写本身已按批拆分 |
| 20s 重连窗口拖慢坏环境下的首调 | 只在 boot 后一次；失败照常返回 `V2_BRIDGE_DOWN` |
