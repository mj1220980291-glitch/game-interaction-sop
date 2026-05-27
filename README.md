# game-interaction-sop

AI-driven SOP for turning a game UI requirement doc into a structured
Figma interaction document — end-to-end in a single conversation.

> Requirement doc → designer Figma draft → v2 Markdown (validated) → Figma 1:14 document  
> Runs in Claude / Codex / Cursor / Cline via the **figma-console MCP** plugin.

> **首次收到这份压缩包的同事，请先看 [SETUP.md](./SETUP.md) 的 4 步启用指南。**

> **🔄 v0.3 升级提示**：从 v0.3 起 SOP 由原本的 4-Phase 重构为 **6-Stage**
> 流程（含设计师独立创作阶段 Stage 2 + 设计稿对齐阶段 Stage 3）。已有的
> v2 Markdown 文件、Figma 模板、引擎调用契约**完全向后兼容**。
> 详见 [`openspec/changes/restructure-sop-to-6-stages/`](./openspec/changes/restructure-sop-to-6-stages/) 的迁移记录。

---

## What you get

| Package | What it is | Install |
|---|---|---|
| [`@game-interaction-sop/engine`](./packages/engine) | Deterministic TS engine: parser + renderer. Host-agnostic via `FigmaBackend` interface. | `npm install @game-interaction-sop/engine` |
| [`@game-interaction-sop/mcp-adapter`](./packages/mcp-adapter) | `FigmaBackend` implementation that speaks to figma-console MCP through a caller-supplied `exec(code)` function. Includes `scanFigmaNodeForUnderstanding` helper for Stage 3. | `npm install @game-interaction-sop/mcp-adapter` |
| [`packages/skill`](./packages/skill) | Markdown SOP bundle (6 stages + references) for AI agents. | `node scripts/install-skill.mjs --agent codex` |

The skill guides the AI agent through 6 stages and combines engine +
adapter at Stage 5. Agent supplies a thin `exec` bridge to its MCP
`figma_execute` tool; adapter + engine handle the rest.

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
hard-coded in `packages/engine/src/v2/template-map.ts`:

```
TEMPLATE_FILE_KEY = 'UYCJok3MXTWITMfeJSqEF6'
TEMPLATE_NODE_ID  = '1:14'
```

1. Open the template file (see link in the GitHub release notes)
2. `File → Save as` / duplicate into your own team
3. Make sure the `1:14` COMPONENT is accessible in the duplicate
4. Point your work sessions at your copy

---

## 3-step quick start

### 1. Install the skill and the MCP runtime into your agent

```bash
git clone https://github.com/YOUR_ORG/game-interaction-sop.git
cd game-interaction-sop
npm install
npm run build

# Unpack bundled figma-console-mcp and print a config snippet to paste:
npm run install-mcp   -- --agent codex   # or claude / cursor / cline

# Copy the SOP skill into your agent's skills directory:
npm run install-skill -- --agent codex   # or claude / cursor / cline
```

### 2. Open your agent and activate the skill

The skill lives at the path printed by the install script, e.g.
`~/.codex/skills/game-interaction-sop/`. Agents that auto-scan this
directory will pick it up on the next session.

### 3. Feed it a requirement doc

> "Run `game-interaction-sop` on `<your requirement doc>`.
> Target Figma file: `<your duplicated template file URL>`."

The AI will walk you through Stage 0 → 5 automatically. A complete run
produces:

- a `_requirements.md` derivative of the planner doc (planner source
  preserved untouched)
- a `_design-understanding.json` recording the UI ↔ requirement mapping
  produced from the designer's Figma draft
- a validated v2 Markdown `_交互文档.md` saved next to the source doc
- a filled-in Figma document with multi-section layouts, numbered
  bubbles anchored to UI elements (or DEFAULT_BUBBLE_GRID fallback if
  Stage 3 was deferred), and main images rasterized from the
  designer's Figma frames

---

## How it works (1-screen summary)

```
 Stage 0   Routing            Agent reads planner doc → recommends 1A or 1B
                              → user confirms / overrides
       ↓
 Stage 1A  Fast Intake        Agent asks blocking questions only
   OR     →                   Agent ALSO surfaces filtered UX suggestions
 Stage 1B  UX Co-Creation     (3-layer filter; explicit acceptance required)
       ↓
 Stage 2   Designer Creation  Agent pauses; designer drafts in Figma
                              → designer announces node IDs
       ↓
 Stage 3   Design Alignment   Agent scans draft, maps to requirements,
                              two-way dialogue → _design-understanding.json
                              (conflicts ↻ Stage 1 partial re-review)
       ↓
 Stage 4   Markdown           Agent generates _交互文档.md
                              (synthesizes _requirements + _design-understanding)
       ↓
 Stage 5   Figma Render       Engine renders into template 1:14 using
                              designUnderstanding (preferred) / assetMap (legacy)
```

- **Skill** orchestrates the conversation and emits validated artifacts
- **Engine** parses Markdown, validates, and issues Figma writes
- **MCP Adapter** bridges agent's `figma_execute` → engine's `FigmaBackend`
- **figma-console MCP** is the runtime that actually touches Figma

---

## Development

```bash
npm install                     # installs workspaces
npm run build                   # tsc for all packages
npm run test                    # smoke-check + vitest across packages
npm run check-skill-migration   # smoke that the 4-Phase → 6-Stage migration is clean

# engine-only
npm run build -w @game-interaction-sop/engine
npm run test  -w @game-interaction-sop/engine
```

---

## License

MIT.

## Credits

The v2 Markdown contract, the Figma template design rules, and the
6-Stage SOP architecture were hardened through real-world runs. See:
- [`packages/engine/docs/figma-mcp-pitfalls.md`](./packages/engine/docs/figma-mcp-pitfalls.md)
  for the full list of MCP / template coord-system pitfalls and how the
  engine enforces safety
- [`openspec/changes/restructure-sop-to-6-stages/`](./openspec/changes/restructure-sop-to-6-stages/)
  for the rationale behind the v0.3 stage redesign

---

## BREAKING change — proxy-figma-console-tools-from-engine

The MCP server `figma-interaction-doc-engine` now **proxies all
`figma-console-mcp` tools** through itself. MCP hosts (CodeMaker, Cursor,
etc.) MUST configure only **one** Figma-related MCP server going forward.

If you previously configured a standalone `figma-console` MCP server in
addition to `figma-interaction-doc-engine`, **remove the standalone entry**.

See migration steps in
[`packages/figma-mcp-server/README.md`](./packages/figma-mcp-server/README.md#configuration-migration-breaking--proxy-figma-console-tools-from-engine).
