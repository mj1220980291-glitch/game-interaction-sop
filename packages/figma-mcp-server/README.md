# figma-interaction-doc-engine

Deterministic engine that turns interaction-doc DSL (YAML) into Figma documents
via [`figma-console-mcp`](https://github.com/...). Replaces the rule-heavy
SKILL.md workflow with a code-enforced pipeline.

> **Status**: 0.1.0 — backend integration is manual, see "Current limits" below.

---

## What it does

The engine takes a small YAML DSL describing a game-UI interaction document and
produces a Figma layout via `figma_execute`. Crucially, the **layout rules**
that used to live in SKILL.md now live in TypeScript:

- FRAME-local coordinate math (`local = abs - parent.absoluteBoundingBox`)
- Z-order via `parent.insertChild(0, node)` — never `appendChild`
- Section title cleanup (strip `01.`, `# `, etc.)
- Screenshot count alignment with sections (placeholder + warning)
- Template choice (design-driven vs blank)
- Phase-level checkpoints with hash chain → idempotent re-entry

The LLM's job shrinks to: **Markdown → YAML translation**. The engine refuses
malformed YAML before any Figma call goes out.

---

## Architecture

```
CodeMaker (LLM)
    │
    │ tools/call generate_interaction_doc(yaml)
    ▼
┌─────────────────────────────────────────────────────┐
│ figma-interaction-doc-engine  (this package)        │
│                                                     │
│  validate (Zod) → plan (pure)                       │
│   → executor.run(template, params)                  │
│   → checkpoint.write(phase)                         │
└─────────────────────────────────────────────────────┘
    │                                  ▲
    │ figma_execute(code)              │ resp
    ▼                                  │
┌─────────────────────────────────────────────────────┐
│ figma-console-mcp (peer dependency)                 │
└─────────────────────────────────────────────────────┘
    │
    ▼
Figma Desktop (Bridge plugin)
```

Each `figma_execute` call comes from a **template literal** in
`src/templates/`. The executor refuses arbitrary JS — there is no `runRaw`.

---

## Quick start

```cmd
npm install
npm run build
npm test                    # 93 tests, < 2s
npm run test:coverage       # lines >= 90%, branches >= 80%
node dist/server/index.js   # stdio MCP server
```

Register the server in CodeMaker — see [`docs/INSTALL.md`](docs/INSTALL.md).

---

## MCP tools exposed

| tool | needs Figma? | purpose |
|---|---|---|
| `validate_dsl` | no | schema + semantic check, returns `{ ok, errors? }` |
| `dry_run_layout` | no | full plan without Figma I/O, returns `{ plan, warnings }` |
| `generate_interaction_doc` | yes | run all 7 phases end-to-end |
| `replay_from_checkpoint` | yes | resume from a specific phase after failure |

---

## Current limits

The shipped stdio entrypoint is **backend-less**: `validate_dsl` and
`dry_run_layout` work standalone, but `generate_interaction_doc` returns
`EXECUTOR_BACKEND_UNAVAILABLE` until a `FigmaExecuteBackend` is wired in.

Two paths to actual Figma generation today:

1. **Manual two-step** (works now): LLM calls `dry_run_layout` to obtain the
   deterministic plan, then translates each plan entry into individual
   `figma-console.figma_execute(code)` calls. Engine still owns coord math,
   z-order and validation; LLM only does mechanical translation.
2. **Embedded backend** (planned): the engine spawns a stdio child of
   `figma-console-mcp` and bridges its `figma_execute` into the executor.
   This collapses the workflow to a single MCP call. See
   `openspec/changes/build-figma-interaction-doc-engine/tasks.md` for status.

---

## Project layout

```
src/
  dsl/         Zod schemas + validate() + 11 error codes
  parser/      Markdown → IR (sections, design refs, annotation table, screenshots)
  planner/     coords + zorder + screenshots + template + title + plan()
  executor/    backend interface + Executor (template-only run)
  templates/   atomic figma_execute templates (cloneAndPlace, fillText, …)
  checkpoint/  phase-level store with hash chain & drift detection
  server/      MCP tool registrations + 7-phase pipeline
tests/         93 vitest cases, fixture-driven planner tests
e2e/           Playwright (local-only, manual baseline)
docs/INSTALL.md
```

---

## Related

- Spec: `openspec/changes/build-figma-interaction-doc-engine/`
- Skill (LLM facing): `C:\Users\miaochengming\.codex\skills\game-interaction-doc\SKILL.md` (v5)
- Legacy fallback: `legacy/SKILL.v4.md` in the same skill directory
