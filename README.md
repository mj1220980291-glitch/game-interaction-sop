# game-interaction-sop

AI-driven SOP for turning a game UI requirement doc into a structured
Figma interaction document — end-to-end in a single conversation.

> Strategy doc / UI spec → v2 Markdown (validated) → Figma 1:14 document  
> Powered by **figma-interaction-doc-engine** MCP + AI agent skill.

> **首次配置？请把 [SETUP.md](./SETUP.md) 交给你的 AI Agent，让它引导你完成安装。**

> **v2（SOP 2.0 / 引擎 0.2）能力汇总：[V2.md](./V2.md)** — 库引用模式、真实实例主图、`- @职能：` 条目、文风 mod 与学习回写。变更记录见 [CHANGELOG.md](./CHANGELOG.md)。

---

## What you get

| Package | What it is | How it's used |
|---|---|---|
| [`packages/figma-mcp-server`](./packages/figma-mcp-server) | The engine, exposed as the `figma-interaction-doc-engine` MCP server. Parses v2 Markdown and writes into the Figma template. Also proxies all figma-console tools. | Register as an MCP server (see [SETUP.md](./SETUP.md)) |
| [`packages/skill`](./packages/skill) | Markdown SOP bundle (Phase 0–6 + references) for AI agents. | `npm run install-skill -- --agent codemaker` |

The skill drives the conversation through the phases; at Phase 4 it calls
the engine's `validate_v2_markdown` and `render_v2_markdown_to_figma`
MCP tools. No glue code required from the agent. Phase 5 distills manual
wording edits into the project style file; Phase 6 maintains the pattern library.

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

The engine no longer hard-codes the template. It resolves, in order:

1. `template: { fileKey, nodeId }` on `render_v2_markdown_to_figma`
2. env `FIGMA_TEMPLATE_FILE_KEY` / `FIGMA_TEMPLATE_NODE_ID`
3. `~/.game-interaction-sop/template.json`
4. the `figma` block of `~/.game-interaction-sop/config.local.json`
5. built-in default (`UYCJok3MXTWITMfeJSqEF6` / `1:14`)

```json
{
  "template": { "fileKey": "your-file-key", "nodeId": "1:14" },
  "roleBlock": { "componentSetId": "1:2" }
}
```

**Only the address is configurable** — the template's internal node names /
slots must stay compatible with `packages/skill/references/template-1-14.md`.

`roleBlock.componentSetId` points at the `职能标记` COMPONENT_SET (variants
`职能标记=#策划` / `职能标记=策划` …) inside the same file. Markdown bullets
written as `- @策划：…` render as instances of that component instead of plain
text; without the set the render fails with `V2_ROLE_BLOCK_UNAVAILABLE`.

1. Open the template file (see link in the GitHub release notes)
2. `File → Save as` / duplicate into your own team
3. Make sure the template COMPONENT (and, if you use `@职能` bullets, the
   `职能标记` component set) is accessible in the duplicate
4. Point `~/.game-interaction-sop/template.json` at your copy

---

## Project style mod

Optional per-project style files in `.interaction-sop/` tune **how** the
Markdown is written without touching the phases:

| File | Role | Written by |
|---|---|---|
| `style.md` | clean project baseline; read-only | humans only, never the agent |
| `style_own.md` | personal style; active as soon as it exists | Phase 5 auto-distillation |
| `style_<name>.md` | imported / shared styles | import or Phase 5 when selected |

Resolution order (first match wins): any `style_<name>.md` present → ask once per
document which one to use (default `style_own.md`); otherwise `style_own.md`
present → use it silently; otherwise only `style.md` → use it; nothing present →
skill defaults.

- `verbosity` — terse / normal / verbose, bullets per cluster
- `role_annotation` — when a rule becomes a `- @职能：…` bullet (and therefore
  a 职能标记 component), or never
- `wording` — tone, person, banned words, term substitutions

Contract: `packages/skill/references/style-mod-schema.md`. Missing files = skill
defaults, nothing breaks.

### Style learning loop (Phase 5)

Phase 2 stores a snapshot of the Markdown it saves
(`.interaction-sop/snapshots/<需求名>.md`). After the Figma document is
delivered, Phase 5 diffs that snapshot against the current file (and optionally
reads back wording the user edited inside Figma), lists the reusable style
entries once for confirmation, and writes the accepted ones back — first copy of
`style_own.md` is seeded from `style.md`, which itself is never modified.

### Main images are live instances

`figma_instance` assets place a **real instance** of a design master (or a
pasted sub-instance) over 主图占位: the placeholder is scaled/centred and then
removed, the instance stays linked to its component. Unlike `figma_node`, nothing
is rasterized.

```json
{ "01": { "type": "figma_instance", "fileKey": "…", "nodeId": "523:7289" } }
```

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

新开 Agent 会话后直接喂策划文档即可，Skill 会全程引导（Phase 0–6）。

---

## How it works

```
Phase 0  翻库咨询     查项目模式库（无库静默跳过）
     ↓
Phase 1  需求挖掘     读策划文档 → 澄清阻塞问题 → 确认本次用哪份文风
     ↓
Phase 2  v2 Markdown  生成结构化交互文档 → 用户审核 → 保存磁盘 + diff 快照
     ↓
Phase 3  索要设计稿   收集截图 / Figma 链接 / 或跳过用占位（母版走 figma_instance）
     ↓
Phase 4  写入 Figma   读模板配置 preflight → 引擎渲染（气泡 + 说明块 + 配图占位）
     ↓
Phase 5  文风沉淀     快照 diff / Figma 表述读回 → 列清单确认 → 写入本次生效的文风
     ↓
Phase 6  模式库维护   按风险分级增量维护项目模式库
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
