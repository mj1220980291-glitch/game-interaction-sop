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
