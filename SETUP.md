# 上手配置指南

> **面向 AI Agent**：本文档是结构化的逐步安装指南。你的 AI 助手可以直接读取这份文档，引导你完成全部配置。

本仓库提供一套 AI 驱动的游戏 UI 交互文档 SOP，核心由三部分组成：

| 部分 | 说明 |
|---|---|
| `packages/figma-mcp-server/` | MCP 引擎服务（`figma-interaction-doc-engine`），负责解析 Markdown 并写入 Figma 模板 |
| `packages/skill/` | AI Agent 使用的 SOP Skill（4 个阶段的 Markdown 指引） |
| `vendor/` | 内置的 `figma-console-mcp` 运行时（MIT 许可，无需单独安装） |

---

## 前置要求

| 项 | 最低版本 | 检查命令 |
|---|---|---|
| Node.js | ≥ 20 | `node -v` |
| Figma 桌面端 | 最新 | — |
| AI Agent（支持 MCP） | — | CodeMaker / Claude Desktop / Cursor / Cline 等 |
| Figma Access Token | — | 见步骤 3 |

---

## 配置步骤

### 步骤 1：克隆仓库并编译引擎

```bash
git clone <仓库地址>
cd game-interaction-sop/packages/figma-mcp-server
npm install
npm run build
```

编译成功后 `dist/server/index.js` 会出现，这就是 MCP Server 的入口。

验证编译（可选）：

```bash
node dist/server/index.js
# 进程停在 stdin 等待，说明启动正常，Ctrl+C 退出
```

---

### 步骤 2：配置 figma-interaction-doc-engine MCP Server

> **重要**：只需配置 `figma-interaction-doc-engine` **一个** MCP Server。  
> figma-console-mcp 已内置在引擎里，由引擎自动管理，**不需要**单独配置。

在你的 AI Agent 的 MCP 配置里添加以下条目（根据 agent 类型选对应格式）：

#### CodeMaker（推荐）

在 CodeMaker 的 MCP 配置界面添加自定义服务：

| 字段 | 值 |
|---|---|
| Name | `figma-interaction-doc-engine` |
| Type | `stdio` |
| Command | `node` |
| Args（第一行） | `<仓库绝对路径>/packages/figma-mcp-server/dist/server/index.js` |
| Env | `FIGMA_ACCESS_TOKEN=<你的 Token>` |
| AutoApprove | `true` |
| Timeout | `120` |

#### Claude Desktop / Cursor / Cline（JSON 格式）

打开对应 agent 的 MCP 配置文件，合并以下内容：

```jsonc
{
  "mcpServers": {
    "figma-interaction-doc-engine": {
      "command": "node",
      "args": [
        "<仓库绝对路径>/packages/figma-mcp-server/dist/server/index.js"
      ],
      "env": {
        "FIGMA_ACCESS_TOKEN": "<你的 Token>"
      }
    }
  }
}
```

Windows 路径示例：`C:\\Users\\yourname\\game-interaction-sop\\packages\\figma-mcp-server\\dist\\server\\index.js`

配置文件位置：
- Claude Desktop（macOS）：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop（Windows）：`%APPDATA%\Claude\claude_desktop_config.json`
- Cursor：`~/.cursor/mcp.json`

配置完成后**重启 Agent**。

---

### 步骤 3：获取并配置 Figma Access Token

1. 打开 Figma → 左上角头像 → **Settings** → **Security** → **Personal access tokens**
2. 点 **Generate new token**，权限勾选 `File content: Read only`
3. 复制生成的 Token（格式：`figd_xxxxxxx`）
4. 填入步骤 2 的 `FIGMA_ACCESS_TOKEN` 环境变量

---

### 步骤 4：安装 Figma Desktop Bridge 插件（一次性）

引擎通过 figma-console-mcp 操作 Figma，需要先在 Figma 桌面端安装并运行 bridge 插件。

1. 运行以下命令查看插件 manifest 路径：

   ```bash
   node scripts/install-mcp.mjs --dry-run
   ```

   输出末尾会打印类似：
   ```
   Choose: ~/.game-interaction-sop/mcp/figma-console-mcp/figma-desktop-bridge/manifest.json
   ```

   > 也可以先运行 `node scripts/install-mcp.mjs --force`（解包 vendor 里的 tarball），再看路径。

2. 打开 **Figma 桌面端** → 顶部菜单 → **Plugins** → **Development** → **Import plugin from manifest…**

3. 选择上一步打印的 `manifest.json` 文件

4. 每次使用 SOP 前，在目标 Figma 文件里运行这个插件并保持窗口打开

---

### 步骤 5：安装 SOP Skill 到 Agent

```bash
# 在仓库根目录运行，选择对应你的 agent
npm run install-skill -- --agent codemaker   # CodeMaker
npm run install-skill -- --agent claude
npm run install-skill -- --agent cursor
npm run install-skill -- --agent cline

# 确认安装路径（dry-run 不复制）
npm run install-skill -- --agent codemaker --dry-run
```

Skill 安装后，新开一个 Agent 会话即可使用。

> **更新 skill**：当你拉取仓库新版本后，重新运行 `npm run install-skill -- --agent <你的 agent> --force` 同步最新内容。

---

### 步骤 6：准备 Figma 模板

引擎写入的目标是一个固定的 Figma 模板（file key `UYCJok3MXTWITMfeJSqEF6`，node `1:14`）。

1. 向分发者索取模板文件的 Figma 链接，或让对方把文件共享给你
2. 将文件复制到你自己的 Figma 团队（`File → Duplicate`）
3. 使用时把你的副本 URL 告诉 AI Agent

---

## 更新到新版本

分发者推送了仓库更新后，**根据改动类型**执行对应步骤：

```bash
git pull
```

然后判断本次更新改了什么：

```bash
git log --oneline -5   # 看最近几条提交
```

| 改动类型 | 如何判断 | 需要做什么 |
|---|---|---|
| 引擎代码（`src/**/*.ts`） | commit 里有 `fix(render)` / `feat(render)` / `perf` 等 | ① `npm run build --prefix packages/figma-mcp-server` <br> ② 重启 MCP Server（见下） |
| Skill 文件（`packages/skill/**`） | commit 里有 `feat(skill)` / `docs` 等 | `npm run install-skill -- --agent <你的 agent> --force` |
| 两者都有 | | 以上步骤都做 |

### 重启 MCP Server

引擎代码编译完成后，需要重启 MCP Server 进程才能加载新代码：

- **CodeMaker**：扳手图标 → MCP Servers → `figma-interaction-doc-engine` → 禁用，再启用
- **Claude Desktop / Cursor / Cline**：完全退出并重新打开 Agent

> 只重启会话（新建对话）**不够**，必须重启 MCP Server 进程本身。

---

## 开发模式（仅限本地迭代）

如果你自己在改引擎代码或 Skill 文件，可以开启 watch 模式，文件保存后自动同步：

```bash
npm run watch                        # 默认 agent: codemaker
npm run watch -- --agent claude      # 指定其他 agent
```

watch 模式会：
- 监听 `packages/skill/**` → 自动执行 `install-skill --force`
- 监听 `packages/figma-mcp-server/src/**` → 自动执行 `npm run build`，并提示你重启 MCP Server

> **注意**：watch 只处理「同步到运行时」，每次引擎 build 后仍需手动重启 MCP Server 进程。

---

## 开始使用

配置完成后，在 Agent 里新开会话：

```
用 game-interaction-sop 处理这份策划文档：[策划文档路径或内容]
```

Agent 会按 4 个阶段引导你：

```
Phase 1 — 需求挖掘       分析策划文档，澄清阻塞性问题
     ↓
Phase 2 — v2 Markdown    生成并保存结构化交互文档
     ↓
Phase 3 — 索要设计稿     收集截图 / Figma 链接 / 或跳过
     ↓
Phase 4 — 写入 Figma     调用引擎，渲染到模板 1:14
```

---

## 常见问题

### Q1. 编译时 tsc 报错？

```bash
node -v   # 确认 ≥ 20
cd packages/figma-mcp-server && npm install
```

### Q2. Agent 不认识这个 skill？

- 确认安装路径正确：`npm run install-skill -- --agent <你的 agent> --dry-run`
- 重启 Agent 会话（有些 agent 需要重启才扫描新 skill）

### Q3. Phase 4 报错 / Figma 没有变化？

按以下顺序排查：
1. `figma-interaction-doc-engine` MCP Server 是否显示 ✅ 已连接
2. `FIGMA_ACCESS_TOKEN` 是否正确设置
3. Figma Desktop Bridge 插件是否在目标文件里运行中（插件窗口需保持打开）
4. 目标 Figma 文件的 node `1:14` 是否可访问（权限是否足够）

### Q4. 我想修改 skill 内容？

```bash
# 编辑 packages/skill/phases/*.md 或 packages/skill/references/*.md
# 改完后同步到 agent
npm run install-skill -- --agent <你的 agent> --force
```

### Q5. 想更新到最新版本？

```bash
git pull
cd packages/figma-mcp-server && npm install && npm run build
npm run install-skill -- --agent <你的 agent> --force
```

---

## 目录结构速查

```
game-interaction-sop/
├── packages/
│   ├── figma-mcp-server/   → MCP 引擎服务（figma-interaction-doc-engine）
│   │   ├── src/v2/         → parser + renderer 核心逻辑
│   │   ├── bin/            → MCP Server 入口（编译后用 dist/server/index.js）
│   │   └── tests/          → 单测
│   └── skill/              → AI Agent SOP（SKILL.md + 4 phases + references）
├── scripts/
│   ├── install-skill.mjs   → 安装 skill 到 agent
│   └── install-mcp.mjs     → 解包 figma-console-mcp（步骤 4 用）
├── vendor/
│   └── figma-console-mcp-1.23.0.tgz   → 内置 MCP runtime（MIT）
├── README.md
├── SETUP.md                → 本文件
└── package.json
```
