# game-interaction-sop (skill package)

Markdown assets that teach an AI agent (Claude / Codex / Cursor / Cline / CodeMaker)
to run the 7-step game UI interaction-doc SOP:

1. **Phase 0 · Recall** — look up the project pattern library (silently skipped when absent)
2. **Phase 1 · Analysis** — confirm requirements, pick the active style mod
3. **Phase 2 · Markdown** — write v2 Markdown passing strong validation, then save a diff snapshot
4. **Phase 3 · Asset** — collect design nodes/images (masters must be placed as `figma_instance`)
5. **Phase 4 · Figma** — preflight template config, render into the template
6. **Phase 5 · Style Learn** — distill this round's manual wording edits into the style file
7. **Phase 6 · Library** — maintain the project pattern library

## Install

From the monorepo root:

```bash
# default to Codex
node scripts/install-skill.mjs

# or pick an agent
node scripts/install-skill.mjs --agent codemaker
node scripts/install-skill.mjs --agent claude
node scripts/install-skill.mjs --agent cursor
node scripts/install-skill.mjs --agent cline
```

This copies the skill into the agent's skill directory as declared in
`manifest.json → installTargets`.

## Files

- `SKILL.md` — entry; agents read this first
- `phases/` — phase-specific instructions (0–6)
- `references/` — authoritative spec files (Markdown v2 contract, template
  map, role tags, style-mod contract, pattern-library schemas), plus
  `style-default.md` — the bundled default style (cluster structure +
  role-annotation rules) that is loaded automatically when a project has no
  `style*.md`, so a fresh install works with zero configuration
- `agents/` — agent-specific overrides (e.g. `openai.yaml`)
- `manifest.json` — machine-readable metadata (version, phases, targets,
  companion engine version)

## Relationship to the engine

The skill itself does not execute Figma writes. It orchestrates the
conversation and, in Phase 4, calls the `figma-interaction-doc-engine`
MCP server's `validate_v2_markdown` / `render_v2_markdown_to_figma`
tools. The engine owns all Figma I/O and pitfall protection.

Before Phase 4, a Figma connection plugin must be running in the target file.
Preferred: <https://www.figma.com/community/plugin/1695400514520991057>
(works in the browser, no desktop client needed). The local Desktop Bridge
plugin is the fallback.
