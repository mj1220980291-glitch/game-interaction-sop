# figma-interaction-doc-engine

Deterministic engine that turns **v2 interaction-doc Markdown** into Figma
documents, exposed as an MCP stdio server. Also proxies every
`figma-console-mcp` tool so the host only needs one Figma-related MCP server.

---

## What it does

The engine takes the v2 Markdown produced by the
[`game-interaction-sop` skill](../skill) and fills the master Figma template
`1:14`. All layout rules that used to live in SKILL.md live in TypeScript
here:

- FRAME-local coordinate math (`local = abs - parent.absoluteBoundingBox`)
- GROUP bbox-explosion guards
- Role TEXT keep-first deletion per cluster
- Image-placeholder two-way resolution (bullet marker × assetMap)
- Bubble seed trimming and per-section numbering
- Single-point probe before batch moves

The LLM's job is: **write conformant v2 Markdown, then call one tool**. No
glue code, no hand-written `figma_execute` scripts.

See [`docs/figma-mcp-pitfalls.md`](docs/figma-mcp-pitfalls.md) for the
underlying pitfalls and how each is neutralised.

---

## Architecture

```
AI agent (skill Phase 4)
    │
    │ tools/call render_v2_markdown_to_figma({ markdown, assetMap, target })
    ▼
┌─────────────────────────────────────────────────────┐
│ figma-interaction-doc-engine  (this package)        │
│                                                     │
│  parseV2 (markdown → IR)                            │
│   → renderV2MarkdownToFigma(IR, backend)            │
│   → FigmaBackend (scanSubtree / batchClone / …)     │
└─────────────────────────────────────────────────────┘
    │                                  ▲
    │ figma_execute(code)              │ resp
    ▼                                  │
┌─────────────────────────────────────────────────────┐
│ figma-console-mcp  (spawned as a child by engine)   │
└─────────────────────────────────────────────────────┘
    │
    ▼
Figma Desktop (Bridge plugin)
```

Markdown that fails hard validation never reaches Figma.

---

## Quick start

```cmd
npm install
npm run build
npm test                    # 52 tests, < 3s
node dist/server/index.js   # stdio MCP server
```

Register the server in your MCP host — see [`docs/INSTALL.md`](docs/INSTALL.md)
or the repo-root [`SETUP.md`](../../SETUP.md).

---

## MCP tools exposed

Native:

| tool | needs Figma? | purpose |
|---|---|---|
| `validate_v2_markdown` | no | hard-validate markdown, returns `{ ok, errors, warnings, ir }` |
| `render_v2_markdown_to_figma` | yes | fill template `1:14` from markdown + assetMap |

Plus every tool from the spawned `figma-console-mcp` child, forwarded
verbatim (`figma_execute`, `figma_capture_screenshot`, `figma_get_selection`,
…). Tool-name collisions between native and proxied tools abort startup.

`render_v2_markdown_to_figma` returns `V2_BACKEND_UNAVAILABLE` if the server
was constructed without a `v2Backend` — in practice this means the
figma-console child failed to start, or no Figma connection plugin is running
in the target file. Preferred connection plugin (works in the browser):
<https://www.figma.com/community/plugin/1695400514520991057>; the local
Desktop Bridge plugin is the fallback.

---

## Project layout

```
src/
  v2/          parser (markdown → IR) + render + figma-client + template-map
  server/      createServer (tool registry + proxy dispatch)
               figmaConsoleBackend (FigmaBackend over the child MCP)
               detectExternal (duplicate figma-console-mcp guard)
               index.ts (stdio entrypoint, spawns the child)
tests/         52 vitest cases
docs/          INSTALL.md, figma-mcp-pitfalls.md
```

> **History**: a first-generation YAML-DSL pipeline (`src/{dsl,parser,planner,executor,checkpoint,templates}`
> plus the `validate_dsl` / `dry_run_layout` / `generate_interaction_doc` /
> `replay_from_checkpoint` tools) was removed in the OpenSpec change
> `remove-gen1-dsl-pipeline`. It never passed acceptance and was superseded by
> the v2 Markdown pipeline. Its design docs and the checkpoint implementation
> are archived under that change's `reference/`.

---

## Related

- Specs: [`openspec/specs/`](../../openspec/specs/)
- Skill (LLM facing): [`packages/skill`](../skill)

---

## Configuration migration (BREAKING — proxy-figma-console-tools-from-engine)

Since the OpenSpec change `proxy-figma-console-tools-from-engine`, this engine
**proxies all `figma-console-mcp` tools** through itself. As a consequence,
only **one** Figma-related MCP server should be configured in your MCP host
(e.g. CodeMaker, Cursor, Claude Desktop).

### Required steps

1. Open the host's MCP settings panel.
2. **Remove the standalone `figma-console` MCP server** entry (the one that
   runs `npx -y figma-console-mcp@latest` directly).
3. Keep only `figma-interaction-doc-engine` configured, pointing at this
   package's `dist/server/index.js` with `FIGMA_BACKEND=figma-console`.
4. Restart the host so it spawns a fresh engine process.
5. Reconnect the Figma plugin in the target file — community plugin first
   (<https://www.figma.com/community/plugin/1695400514520991057>, works in the
   browser), Desktop Bridge only as fallback.

### Why

Hosts previously typically configured **two** MCP servers exposing Figma tools:

- `figma-console` (standalone) — exposing `figma_execute`,
  `figma_capture_screenshot`, `figma_get_selection`, ...
- `figma-interaction-doc-engine` — exposing `render_v2_markdown_to_figma`,
  `validate_v2_markdown`, ...

But the engine internally also spawns its own `figma-console-mcp` child to
power v2 rendering. The `figma-console-mcp` package binds a unique WebSocket
port per process, and the **Figma connection plugin can only connect to
one of them** — leading to silent "Cannot connect to Figma Desktop" errors
whenever the wrong instance won the port race.

After this change, the engine's child is the **only** `figma-console-mcp`
instance, the plugin connects to it predictably, and **all `figma_*` tools
are forwarded transparently** through the engine's MCP server. The host
sees one server that exposes the union of the engine's native v2 tools plus
all `figma-console` tools.

### Symptoms of incomplete migration

If you forget step 2, the engine detects another `figma-console-mcp` port
advertisement file in `os.tmpdir()` at startup and emits a stderr warning:

```
[figma-interaction-doc-engine] WARNING: external figma-console-mcp detected (port=..., pid=..., ...)
```

Watch the engine's stderr in your host's MCP logs for this line.
