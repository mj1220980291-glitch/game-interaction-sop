# game-interaction-sop

AI-driven SOP for turning a game UI requirement doc into a structured
Figma interaction document — end-to-end in a single conversation.

> Strategy doc / UI spec → v2 Markdown (validated) → Figma 1:14 document  
> Powered by **figma-interaction-doc-engine** MCP + AI agent skill.

> **首次配置？请把 [SETUP.md](./SETUP.md) 交给你的 AI Agent，让它引导你完成安装。**

---

## What you get

| Package | What it is | How it's used |
|---|---|---|
| [`packages/figma-mcp-server`](./packages/figma-mcp-server) | The engine, exposed as the `figma-interaction-doc-engine` MCP server. Parses v2 Markdown and writes into the Figma template. Also proxies all figma-console tools. | Register as an MCP server (see [SETUP.md](./SETUP.md)) |
| [`packages/skill`](./packages/skill) | Markdown SOP bundle (Phase 0–5 + references) for AI agents. | `npm run install-skill -- --agent codemaker` |

The skill drives the conversation through the phases; at Phase 4 it calls
the engine's `validate_v2_markdown` and `render_v2_markdown_to_figma`
MCP tools. No glue code required from the agent.

---

## Prerequisites

- Node.js ≥ 20
- An AI agent with MCP support: **Claude Desktop / Codex / Cursor / Cline / ...**
- A duplicated copy of the **master Figma template** (see below)

The [figma-console MCP plugin](https://github.com/southleft/figma-console-mcp)
runtime (v1.23.0, MIT) ships bundled in this repo at
[`vendor/figma-console-mcp-1.23.0.tgz`](./vendor/) — recipients don't need
to install it separately. `npm run install-mcp` unpacks it locally and
prints the config snippet to paste into your agent's MCP config file.

## The Figma template

The engine writes into a canonical master template whose key is
hard-coded in `packages/figma-mcp-server/src/v2/template-map.ts`:

```
TEMPLATE_FILE_KEY = 'UYCJok3MXTWITMfeJSqEF6'
TEMPLATE_NODE_ID  = '1:14'
```

1. Open the template file (see link in the GitHub release notes)
2. `File → Save as` / duplicate into your own team
3. Make sure the `1:14` COMPONENT is accessible in the duplicate
4. Point your work sessions at your copy

---

## Quick start

**完整步骤见 [SETUP.md](./SETUP.md)**，以下是最简流程：

```bash
# 1. 编译引擎
cd packages/figma-mcp-server && npm install && npm run build

# 2. 安装 SOP Skill
cd ../.. && npm run install-skill -- --agent codemaker   # 或 claude/cursor/cline

# 3. 配置 MCP（仅一个 server）
#    在 agent 的 MCP 配置里指向：
#    packages/figma-mcp-server/dist/server/index.js
#    并设置环境变量 FIGMA_ACCESS_TOKEN=<你的 Figma Token>
```

新开 Agent 会话后直接喂策划文档即可，Skill 会全程引导（Phase 1–4）。

---

## How it works

```
Phase 1  需求挖掘      读策划文档 → 澄清阻塞问题 → 确认信息可用
     ↓
Phase 2  v2 Markdown  生成结构化交互文档 → 用户审核 → 保存磁盘
     ↓
Phase 3  索要设计稿   收集截图 / Figma 链接 / 或跳过用占位
     ↓
Phase 4  写入 Figma   引擎渲染到模板 1:14（气泡 + 说明块 + 配图占位）
```

- **Skill**（`packages/skill/`）— 引导对话，生成并验证 v2 Markdown
- **Engine**（`packages/figma-mcp-server/`）— 解析 Markdown，写入 Figma 节点
- **figma-console-mcp**（`vendor/`）— 实际操作 Figma 桌面端的运行时，由引擎内部管理

---

## Development

```bash
npm install                     # installs workspaces
npm run build                   # tsc for all packages
npm run test                    # vitest across packages

# engine-only
npm run build --prefix packages/figma-mcp-server
npm run test  --prefix packages/figma-mcp-server
```

---

## License

MIT.

## Credits

The v2 Markdown contract and the Figma template design rules were
hardened through real-world runs. See:
- [`packages/figma-mcp-server/docs/figma-mcp-pitfalls.md`](./packages/figma-mcp-server/docs/)
  for the full list of MCP / template coord-system pitfalls and how the
  engine enforces safety
- [`openspec/specs/`](./openspec/specs/) for the current capability specs,
  and [`openspec/changes/archive/`](./openspec/changes/archive/) for the
  rationale behind each shipped change

---

## BREAKING change — proxy-figma-console-tools-from-engine

The MCP server `figma-interaction-doc-engine` now **proxies all
`figma-console-mcp` tools** through itself. MCP hosts (CodeMaker, Cursor,
etc.) MUST configure only **one** Figma-related MCP server going forward.

If you previously configured a standalone `figma-console` MCP server in
addition to `figma-interaction-doc-engine`, **remove the standalone entry**.

See migration steps in
[`packages/figma-mcp-server/README.md`](./packages/figma-mcp-server/README.md#configuration-migration-breaking--proxy-figma-console-tools-from-engine).
