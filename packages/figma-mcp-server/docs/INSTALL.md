# 安装与配置：figma-interaction-doc-engine

> 完整的上手流程（含 Figma Token、Desktop Bridge 插件、各家 AI Agent 的
> MCP 配置格式）见仓库根目录的 [`SETUP.md`](../../../SETUP.md)。
> 本文只补充引擎自身的编译与握手验证。

## 概念

`figma-interaction-doc-engine` 是一个 MCP Stdio Server，把 v2 交互文档
Markdown 确定性地写入 Figma 模板 `1:14`。它**不替代** `figma-console-mcp`
——而是把它作为子进程拉起，所有真正改 Figma 的动作仍然走 `figma_execute`。

```
AI Agent (skill Phase 4)
   │
   │ 1) 调 render_v2_markdown_to_figma({ markdown, assetMap, target })
   ▼
figma-interaction-doc-engine        <-- 本工具，注册为 MCP Server
   │
   │ 2) 内部 parseV2 → render，算坐标 / 拼模板 JS
   ▼
figma_execute (来自引擎拉起的 figma-console-mcp 子进程)
   │
   ▼
Figma（连接插件：优先社区插件，回退 Desktop Bridge）
```

引擎对外暴露两个原生工具，外加从子进程透传的全部 `figma_*` 工具：

| 工具 | 需要 Figma 在线？ |
|---|---|
| `validate_v2_markdown` | 否，纯本地校验 |
| `render_v2_markdown_to_figma` | 是 |

---

## 一次性安装

### 1. 编译

```cmd
cd <仓库路径>\packages\figma-mcp-server
npm install
npm run build
```

`dist/` 下出现编译后的 ESM，入口是 `dist/server/index.js`。

### 2. 验证 stdio 握手

```cmd
set FIGMA_BACKEND=figma-console
node dist/server/index.js
```

进程会停在 stdin 等待。粘贴下面两行，每行回车一次：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

stdout 应返回两条 JSON-RPC 响应，第二条含 `validate_v2_markdown` 与
`render_v2_markdown_to_figma`，以及若干 `figma_*` 代理工具。

stderr 会打印一行 banner：

```
[figma-interaction-doc-engine] mcp stdio server ready — native: validate_v2_markdown, render_v2_markdown_to_figma; proxy: N
```

`proxy: 0` 说明子进程没起来：先确认 `FIGMA_BACKEND=figma-console` 已设置，
再检查 `FIGMA_ACCESS_TOKEN`。

### 3. 注册到 AI Agent

见 [`SETUP.md`](../../../SETUP.md) 步骤 2。

> **只配置这一个 MCP Server。** `figma-console-mcp` 由引擎自动管理，
> 若你的 host 里还留着独立的 `figma-console` 条目，务必删除——两个实例
> 会争抢 WebSocket 端口，导致连接插件随机连错。
> 详见 [`../README.md`](../README.md) 的 "Configuration migration" 一节。

---

## 常见问题

### 引擎 MCP 在 host 里「连接失败」（工具根本不在列表里）

先分清两种失败：**工具都不存在**（进程级）vs **工具在、调用报错**（业务级）。
本节只讲前者——此时排插件、排模板、排 Markdown 全是白费。

症状（2026-11-04 实测现场）：

| 位置 | 观测 |
|---|---|
| host 的 MCP 面板 | `figma-interaction-doc-engine` 显示连接失败/断开 |
| host 的 MCP 日志（CodeMaker：`~/.codemaker/codemaker-language-server/logs/<日期>/`） | `Connecting to MCP server: figma-interaction-doc-engine` → 约 17s 后 `connection closed` + `Failed to connect … McpError: MCP error -32000: Connection closed` |
| 可用工具列表 | 没有 `get_skill_requirements` / `render_v2_markdown_to_figma`，也没有代理来的 `figma_*` |

**为什么是 17 秒**：engine 进程本身起来了，supervisor 拉 worker，worker 拉
`figma-console-mcp` 子进程失败 → 重试 3 次（间隔约 4.8s）→ `fatal: McpError` →
整个进程退出 → host 只能报「连接失败」。**引擎自己退出了，不是端口、不是插件。**

30 秒定位（手动跑一遍，直接看 stderr）：

```bat
cd packages\figma-mcp-server
set "PATH=C:\Program Files\nodejs;%PATH%"
set "FIGMA_BACKEND=figma-console"
set "FIGMA_ACCESS_TOKEN=<你的 token>"
node dist/server/index.js
```

进程停在 stdin 等待是正常的，Ctrl+C 退出。

正常应看到 `worker ready … proxy: 134` / `supervisor ready — 140 tool(s)`。两条典型异常：

| stderr | 根因 | 修法 |
|---|---|---|
| `child figma-console-mcp transport error: spawn npx ENOENT` | 引擎进程的 `PATH` 里没有 node 安装目录，`npx` 根本找不到（本机 PATH 事实见 `AGENTS.md`） | 把 `C:\Program Files\nodejs` 加进用户级 `PATH`，重启 host。CodeMaker 首次 ENOENT 会自己刷新 PATH 重试一次，裸 shell 不会 |
| `WARNING: bridge child on port 9224 (preferred 9223); renders will fail … Recovering…` 连刷 3 次后 `fatal` | 9223 被**活着的另一个** `figma-console-mcp` 占着（最常见：host 里同时配了独立的 `figma-console` MCP 条目）。它不是孤儿，引擎的自动回收不会杀它，只能退到 9224 | 删掉/禁用 host 里独立的 `figma-console` 条目——`figma-console-mcp` 由引擎内置托管（见 `SETUP.md` 步骤 2），然后清掉残留监听进程再重启 MCP |

判定「谁占着 9223」：第一条看 `LISTENING` 的 PID，第二条读公告文件里的 `pid` / `startedAt`。

```bat
netstat -ano | findstr "922"
dir "%TEMP%\figma-console-mcp-*.json"
```

两者都排除后仍失败，才回到下面 `V2_BACKEND_UNAVAILABLE` 的排查（那是进程活着、
后端没接上的情形，banner 里 `proxy:` 为 0）。

### 渲染一直失败且 `enginePid` 每次调用都变

症状：连续几次 `render_v2_markdown_to_figma` 都失败，返回体的 `enginePid` 每次不同
（如 49956 → 27364 → 10580），报错恒为 `V2_RENDER_RUNTIME_ERROR / Cannot connect to
Figma Desktop`，端口监听方也在变。

**这不是 worker 自己换人**。worker swap 只发生在 boot 与 `dist` 变更时；
`enginePid` 每调都变 = **宿主把整个 MCP 服务重启了**。证据在宿主的 MCP 日志里
（CodeMaker：`~/.codemaker/codemaker-language-server/logs/<日期>/<时间戳>-<pid>-0.log`）：

```
20:44:12.928  Calling MCP tool: render_v2_markdown_to_figma on server figma-interaction-doc-engine
20:45:12.940  [WARN] MCP callTool self-heal triggered … MCP error -32001: Request timed out
20:45:12.940  Restarting MCP server: figma-interaction-doc-engine (old pid=32288)
20:45:16.817  MCP server connected: figma-interaction-doc-engine   ← 新 enginePid
```

两次时间戳相差**整整 60s** = 宿主的请求超时阈值。触发原因是插件侧
**socket 还在、sandbox 已假死**：`figma_execute` 发出去没有回程，引擎不返回，
宿主到 60s 判超时；重启后插件还没来得及重连，下一次 render 立刻
`Cannot connect`，于是自锁。

0.4.3 起引擎自己收口，不再把 60s 交给宿主：

| 错误码 | 含义 | 用户动作 |
|---|---|---|
| `V2_BRIDGE_DOWN` | 开写前探活失败（默认开，`GISOP_PREFLIGHT=0` 关） | 重开插件后重试 |
| `V2_BRIDGE_NO_REPLY` | 探活过了，但单次 exec 在 `插件 timeout + 5s` 内没有回程（`GISOP_EXEC_TIMEOUT_MS` 可改） | 关掉插件再重开——sandbox 已假死 |

返回体的 `bridge` 快照按这个顺序定性，不用 netstat：

| 字段 | 结论 |
|---|---|
| `bridge.fallback === true` | 端口问题（子进程退到 9224+） |
| `bridge.pluginConnected === false` | 插件没接入 |
| 两者都正常、`lastRoundtripMs` 有值但渲染仍失败 | 不是桥的问题，去查模板 / md |

若日志里仍看到 `self-heal triggered`，说明跑的是旧 build：确认 `engineVersion`
是 `0.4.3` 以上，`npm run build` 后重启该窗口的 MCP。

### 换机器 / 新同事：模板包不用重造

引擎包内自带基线模板包（`assets/packs/default.json`，官方 1.14），查找顺序里排在最后：

```
4  ~/.game-interaction-sop/templates/default.json
5  <引擎包>/assets/packs/<项目名>.json
6  <引擎包>/assets/packs/default.json
```

所以「装完就能渲染」；要切项目就在前 4 级放一份覆盖它（项目目录或用户目录）。想确认
「机器上到底有没有包」用 `$GISOP_BUNDLED_PACKS=off`。

基线包里的 key 是发布快照，库重新发布会失效 → 渲染返回 `V2_TEMPLATE_KEY_STALE`
（含 part / key / pack 路径），用 `figma_compile_template(phase="verify")` 重取。

排查用 `audit_template_pack`（只读）：不传 path 时按渲染同一顺序定位，回答「用的哪份包、
缺哪些观感字段、影响什么」；`deep:true` 加 key import 冒烟。

### 渲染结果里的两条观感告警

| 告警 | 含义 | 怎么办 |
|---|---|---|
| `V2_W_PACK_GEOMETRY_DEFAULTED` | 本次用了默认观感（缺 `docBackground` / `sectionShell`） | 不是错误；要恢复原稿观感就重编模板包 |
| `V2_W_TEXT_CONTRAST_LOW` | 正文与最近实心背景的对比度低于阈值（默认 3.0，`GISOP_CONTRAST_MIN` 可调） | 先查 pack 的 geometry，再查模板本身是不是低对比设计 |

### `V2_BACKEND_UNAVAILABLE`

`render_v2_markdown_to_figma` 返回此错误码，说明引擎启动时没接上 Figma 后端。
按顺序排查：

1. Figma 是否打开了目标文件
2. 环境变量 `FIGMA_BACKEND` 是否为 `figma-console`（缺失时引擎根本不拉子进程）
3. 目标文件里是否有连接插件在**运行中**（插件窗口需保持打开）：优先社区插件
   <https://www.figma.com/community/plugin/1695400514520991057>（网页端即可，不必装客户端）；
   起不来再回退本地 Desktop Bridge
4. 环境变量 `FIGMA_ACCESS_TOKEN` 是否配置
5. host 的 MCP 日志里 stderr banner 的 `proxy:` 数量是否为 0
6. 是否存在第二个 `figma-console-mcp` 实例（见上文）

`validate_v2_markdown` 不受影响，任何时候都可用。

### 重启引擎后 Bridge「坏了」

症状（按严重程度）：

| 现象 | 含义 |
|---|---|
| `figma_get_status` 显示 `portFallbackUsed: true`，端口是 9224+ | 9223 被僵尸占着，插件还连在僵尸上 |
| 工具调用报 `Cannot connect to Figma Desktop … ws://localhost:923x` | 新引擎已经漂到 923x，插件连的是 9223 |
| 每次重启报的端口都不一样（9229 → 9230 → …） | **僵尸在累积**，见下文 |

成因：引擎被强杀时（Windows 上无窗口控制台进程只能强杀，退出钩子一律不执行），
子链 `npx → cmd.exe → local.js` 里只有 `local.js` 不响应 stdin EOF，于是它活下来
继续占着 9223。新引擎的子进程只好退到 9224，而插件还连在那个僵尸上。

引擎**从 2026-08-11 起会在启动时自动回收**：它扫描 `%TEMP%\figma-console-mcp-*.json`，
把「父进程已消失」的实例连同子树杀掉，stderr 会记 `reclaimed Bridge port 9223 from
orphaned figma-console-mcp pid=…`。父进程还活着的实例（例如你另外配置的一份
`figma-console` MCP）不会被动，只会收到 WARNING。

#### 僵尸为什么会累积到「直接连不上」

自动回收只处理「父进程已消失」的实例，而且**一次启动只回收当时存活的那些**。
连续快速重启（改代码 → 重启 → 改代码 → 重启）时：上一个引擎的父进程可能还在
退出途中，子进程被判定为「非孤儿」而跳过；等父进程真死了，已经没人再扫一次。
于是 9224、9225、9226… 逐个被僵尸占住，端口范围只有 `9223–9232`，**占满 10 个之后
新引擎绑不上任何端口，插件就彻底连不上**，而 Figma 里那个插件显示「已连接」——
它连的是最早那只僵尸。

排查（30 秒）：

```bat
netstat -ano | findstr "LISTENING" | findstr ":92"
```

看到 `9223..922x` 一串 `LISTENING` 就是它。对照 MCP 日志 banner 里的实际端口，
**除当前引擎占用的那个以外**，其余监听 9223–9232 的 node 进程都是僵尸。

清理（把 PID 换成上一步查到的，不要杀当前引擎）：

```bat
taskkill /F /PID <僵尸pid>
```

批量清理（PowerShell，执行前先确认列表里没混进当前引擎）：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 9223,9224,9225,9226,9227,9228,9229,9230,9231,9232 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { (Get-Process -Id $_ -ErrorAction SilentlyContinue).ProcessName -eq 'node' } |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

清完再重启一次引擎，它会重新占到首选的 9223，插件通常会自动重连；
没重连就在目标文件里重开一次插件（优先社区插件
<https://www.figma.com/community/plugin/1695400514520991057>，回退 Desktop Bridge）。

预防：改后端代码时不要连环重启——**先停掉旧实例再启动新的**，让子进程随父进程
一起退出，比事后清僵尸省事。

### Markdown 校验不通过

`validate_v2_markdown` 的输出含 `errors[]`，每项带 `code` + `message` +
行号。格式契约见
[`packages/skill/references/markdown-v2-spec.md`](../../skill/references/markdown-v2-spec.md)。

不要手改 Figma 来绕过校验失败——回到 Phase 2 修 Markdown 重跑。
