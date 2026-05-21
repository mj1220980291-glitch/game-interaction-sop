# @game-interaction-sop/engine

Deterministic engine that turns **v2 interaction-doc Markdown** into a
Figma document, following the 1:14 master template.

The engine is host-agnostic: it defines a `FigmaBackend` interface that
you (or the companion `@game-interaction-sop/mcp-adapter` package) wire
to the actual Figma runtime — typically via the figma-console MCP plugin.

## Install

```bash
npm install @game-interaction-sop/engine
```

## Usage

```ts
import {
  parseV2,
  renderV2MarkdownToFigma,
  type FigmaBackend
} from '@game-interaction-sop/engine';

const markdown = /* your v2 Markdown string */ '';
const parsed = parseV2(markdown);
if (!parsed.ok) {
  console.error('Validation failed:', parsed.errors);
  process.exit(1);
}

const backend: FigmaBackend = /* see @game-interaction-sop/mcp-adapter */;

await renderV2MarkdownToFigma({
  markdown,
  assetMap: {
    '01': { type: 'figma_node', fileKey: '...', nodeId: '15:1341' },
    '02': { type: 'figma_node', fileKey: '...', nodeId: '15:1342' }
    // section '03' has name '…全局展示' → isGlobalSpec=true → engine skips main image
  },
  backend,
  target: { fileKey: 'YOUR_FIGMA_FILE', pageId: 'YOUR_PAGE_ID' }
});
```

## v2 Markdown spec

See [`packages/skill/references/markdown-v2-spec.md`](../../packages/skill/references/markdown-v2-spec.md)
in the monorepo root for the authoritative contract.

## Figma template

The engine writes into the master template `1:14` hosted in a canonical
Figma file. See the monorepo root README for the template link and how
to duplicate it into your own file.

## Safety rules

All Figma-side constraints are enforced in [`docs/figma-mcp-pitfalls.md`](./docs/figma-mcp-pitfalls.md).
Any `FigmaBackend` implementation must respect the 5 coord-system rules
there, or the engine will refuse the write and raise
`FigmaSafetyError`.

## Development

```bash
npm run build       # tsc to ./dist
npm run test        # vitest
npm run typecheck   # tsc --noEmit
```
