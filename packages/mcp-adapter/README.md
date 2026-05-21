# @game-interaction-sop/mcp-adapter

Pre-built `FigmaBackend` implementation for
[`@game-interaction-sop/engine`](../engine) — targets the **figma-console
MCP** plugin (or any MCP tool with the same `figma_execute` semantics).

This package is an **AI-agent glue layer**: it does **not** open a MCP
connection itself. Instead, it asks the calling agent to pass in a
simple `exec(code)` function. The agent (Claude / Codex / Cursor /
Cline …) already has MCP access; `exec` is how it lends that access to
the engine.

## Install

```bash
npm install @game-interaction-sop/engine @game-interaction-sop/mcp-adapter
```

## Usage (inside an AI agent conversation)

```ts
import {
  parseV2,
  renderV2MarkdownToFigma
} from '@game-interaction-sop/engine';
import { createFigmaConsoleBackend } from '@game-interaction-sop/mcp-adapter';

// The agent wires `exec` to whatever MCP call it has available.
// Below is the shape when using figma-console MCP:
const backend = createFigmaConsoleBackend({
  exec: async (code) => {
    const resp = await use_mcp_tool('figma-console', 'figma_execute', { code });
    if (!resp.success) throw new Error(resp.error);
    return resp.result;
  }
});

const markdown = /* v2 Markdown string */ '';
const parsed = parseV2(markdown);
if (!parsed.ok) throw new Error(parsed.errors[0]?.message);

await renderV2MarkdownToFigma({
  markdown,
  assetMap: {
    '01': { type: 'figma_node', fileKey: '...', nodeId: '15:1341' },
    '02': { type: 'figma_node', fileKey: '...', nodeId: '15:1342' }
  },
  backend
});
```

## How it works

Each `FigmaBackend` method turns into a short JS snippet that:

1. Calls `figma.getNodeByIdAsync` / `figma.loadFontAsync` / etc.
2. Performs the mutation atomically
3. Returns a plain-object result

The adapter concatenates these snippets with `FIGMA_PLUGIN_HELPERS`
(shared font cache + scan helpers) and forwards the full script to your
`exec`. All Figma-side safety rules (e.g. don't `move_node` inside a
GROUP) are enforced one layer up, inside the engine's `figma-client.ts`
wrappers.

## Not included

- A `FigmaExec` implementation. Agents supply that themselves based on
  their MCP tooling. See the [root
  README](../../README.md) for agent-specific snippets.
- Retry / backoff logic. Figma MCP has a 5-second exec budget; the
  engine schedules work in small batches already, and the adapter
  surfaces failures as `FigmaExecError` so the agent can retry at its
  own layer.

## Development

```bash
npm run build         # tsc → ./dist
npm run test          # vitest
npm run typecheck
```
