# 安装与配置：figma-interaction-doc-engine

## 概念

`figma-interaction-doc-engine` 是一个 MCP Stdio Server，把交互文档 DSL（YAML）
确定性地转换为 Figma 图。它**不替代** `figma-console-mcp`，而是在其之上薄封
装：所有真正改 Figma 的动作仍然走 `figma_execute`。

```
CodeMaker (LLM)
   │
   │ 1) 调 generate_interaction_doc(yaml)
   ▼
figma-interaction-doc-engine        <-- 本工具，注册为 MCP Server
   │
   │ 2) 内部 7-phase 编排器算坐标 / 拼模板 JS
   ▼
figma_execute (来自 figma-console-mcp) <-- 已有依赖
   │
   ▼
Figma 桌面端 (Desktop Bridge 插件)
```

引擎可以以三种方式被使用：

1. **MCP Server 模式**（推荐）：CodeMaker 把它当作 MCP server 启动，LLM
   通过 `tools/call` 调用 4 个工具。
2. **库模式**：在 Node 项目里 `import { validate, plan } from 'figma-interaction-doc-engine'`，纯函数式校验与规划。
3. **离线 dry-run**：只跑 `validate_dsl` 与 `dry_run_layout`，**不需要** figma-console-mcp 在线。

---

## 一次性安装

### 1. 编译

```cmd
cd h:\kk8项目文件\figma-interaction-doc-engine
npm install
npm run build
```

`dist/` 下出现编译后的 ESM。

### 2. 验证 stdio 握手

```cmd
node dist/server/index.js
```

进程会停在 stdin 等待。键盘里粘贴下面两行，每行回车一次：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

stdout 应当返回两条 JSON-RPC 响应，第二条含 4 个工具：
`validate_dsl`、`dry_run_layout`、`generate_interaction_doc`、
`replay_from_checkpoint`。

按 `Ctrl+C` 退出。

---

## 在 CodeMaker 里注册 MCP Server

打开 CodeMaker MCP 配置文件，在 `mcpServers` 节追加一项：

```jsonc
{
  "mcpServers": {
    "figma-console": {
      // ...你现有的 figma-console-mcp 配置不动...
    },
    "figma-interaction-doc-engine": {
      "command": "node",
      "args": [
        "h:\\kk8项目文件\\figma-interaction-doc-engine\\dist\\server\\index.js"
      ],
      "env": {}
    }
  }
}
```

> Windows 路径要么用双反斜杠，要么用正斜杠。

保存后**重启 CodeMaker**，新 server 才会被加载。

---

## 当前限制：generate_interaction_doc 需要 backend

`figma-interaction-doc-engine` 目前的 stdio 入口是 **backend-less** 模式：

| 工具 | 是否可用 |
|---|---|
| `validate_dsl` | ✅ 立即可用，纯本地 |
| `dry_run_layout` | ✅ 立即可用，纯本地 |
| `generate_interaction_doc` | ⚠️ 返回 `EXECUTOR_BACKEND_UNAVAILABLE` |
| `replay_from_checkpoint` | ⚠️ 同上 |

要让 `generate_interaction_doc` 能跑通，需要把 `figma-console-mcp` 的
`figma_execute` 接入引擎的 `FigmaExecuteBackend` 接口。这一步当前需要手工接：

### 临时方案：在 CodeMaker 内分两步走

1. LLM 用 `figma-interaction-doc-engine.dry_run_layout(yaml)` 拿到完整 plan。
2. LLM 把 plan 里每条 execution 翻译成 `figma-console.figma_execute(code)` 直接调用。

引擎已经把 plan 输出做成了**最小化、确定性**的指令清单（`templateChoice`、
`sections[].bubbles[].insert`、`screenshot.src`），LLM 不再需要算坐标、决定
z-order、清洗标题——只是搬运 plan 的字段到 figma_execute 的 code 字段。

### 自动化方案（路线图）

后续会在引擎进程内嵌入一个轻量 MCP client，以 stdio 子进程方式拉起
`figma-console-mcp`，把它的 `figma_execute` 桥接到本引擎的 backend 接口。
那时 `generate_interaction_doc` 就能在引擎进程内端到端完成，无需 LLM 中转。

---

## 故障排查

### `EXECUTOR_BACKEND_UNAVAILABLE`

- 当前预期行为（见上节"当前限制"）。
- 如果你已经按"自动化方案"接入了 backend：检查 `figma-console-mcp` 是否在线
  （`figma-console.figma_get_status` 应返回 ok）。

### `DSL_*` 错误

- `validate_dsl` 的输出包含 `code` + `message` + `hint`，按提示修 YAML 即可。
- 常见错误对照：
  - `DSL_MISSING_META` — YAML 顶部漏 `meta` 块
  - `DSL_META_VERSION_INVALID` — version 不是 `1.0.0` 这样的三段式
  - `DSL_SECTION_TITLE_HAS_PREFIX` — title 写成了 `"01. xxx"`，去掉前缀
  - `DSL_BUBBLE_LAYER_MISSING` — bubble 缺 `layer: overlay`
  - `DSL_ANCHOR_AMBIGUOUS` — anchor 同时给了 nodeId 与 absXY，二选一

### `CHECKPOINT_INPUT_DRIFT`

- 你修改了 YAML 之后用旧 runId 调 `replay_from_checkpoint`。
- 重新调一次 `generate_interaction_doc` 拿新 runId。

### `CHECKPOINT_BROKEN_CHAIN`

- `runs/<runId>/` 下的 phase JSON 丢失或被手工编辑过。
- 删掉这个 runId 的整个目录，重新 generate。

---

## 进程清理

`figma-interaction-doc-engine` 是 stdio 进程，CodeMaker 关闭时会自动退出。
如果发现 `node` 残留：

```cmd
tasklist | findstr "node"
taskkill /PID <pid> /F
```

---

## 文件位置参考

- 引擎源码：`h:\kk8项目文件\figma-interaction-doc-engine\`
- 编译产物：`h:\kk8项目文件\figma-interaction-doc-engine\dist\`
- 运行 checkpoint：`<engine cwd>\runs\<runId>\phase-<n>-<name>.json`
- 单测：`npm test`
- E2E（Playwright，本地）：`npm run test:e2e`
