# game-interaction-sop (skill package)

Markdown assets that teach an AI agent (Claude / Codex / Cursor / Cline)
to run the 4-phase game UI interaction-doc SOP:

1. **Phase 1 · Analysis** — confirm requirements from a 策划 doc
2. **Phase 2 · Markdown** — write v2 Markdown passing strong validation
3. **Phase 3 · Asset** — collect design images (drop into Figma canvas)
4. **Phase 4 · Figma** — render into the 1:14 master template

## Install

From the monorepo root:

```bash
# default to Codex
node scripts/install-skill.mjs

# or pick an agent
node scripts/install-skill.mjs --agent claude
node scripts/install-skill.mjs --agent cursor
node scripts/install-skill.mjs --agent cline
```

This copies the skill into the agent's skill directory as declared in
`manifest.json → installTargets`.

## Files

- `SKILL.md` — entry; agents read this first
- `phases/` — phase-specific instructions
- `references/` — authoritative spec files (Markdown v2 contract, template
  map, role tags)
- `agents/` — agent-specific overrides (e.g. `openai.yaml`)
- `manifest.json` — machine-readable metadata (version, targets, companion
  engine version)

## Relationship to the engine

The skill itself does not execute Figma writes. It orchestrates the
conversation and, in Phase 4, calls the `figma-interaction-doc-engine`
MCP server's `validate_v2_markdown` / `render_v2_markdown_to_figma`
tools. The engine owns all Figma I/O and pitfall protection.
