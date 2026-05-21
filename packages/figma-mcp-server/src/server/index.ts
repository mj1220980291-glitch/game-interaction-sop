/**
 * Stdio entrypoint. Run with `node dist/server/index.js` after build, or
 * `tsx src/server/index.ts` during development.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/engine-mcp-server/spec.md
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from './createServer.js';
import { buildFigmaConsoleBackend } from './figmaConsoleBackend.js';

async function main(): Promise<void> {
  // If FIGMA_BACKEND=figma-console is set, wire a v2Backend by spawning
  // figma-console-mcp as a child process and forwarding calls via MCP client.
  let v2Backend = undefined;

  if (process.env.FIGMA_BACKEND === 'figma-console') {
    const token = process.env.FIGMA_ACCESS_TOKEN ?? '';
    const client = new Client({ name: 'figma-interaction-doc-engine', version: '0.1.0' });
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'figma-console-mcp@latest'],
      env: {
        ...process.env,
        FIGMA_ACCESS_TOKEN: token,
        ENABLE_MCP_APPS: 'true'
      }
    });
    await client.connect(transport);
    v2Backend = buildFigmaConsoleBackend(client);
    process.stderr.write('[figma-interaction-doc-engine] v2Backend wired via figma-console-mcp\n');
  }

  const server = createServer({ v2Backend });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Stderr-only banner so JSON-RPC framing on stdout stays clean.
  process.stderr.write(
    '[figma-interaction-doc-engine] mcp stdio server ready — tools: validate_dsl, dry_run_layout, generate_interaction_doc, replay_from_checkpoint\n'
  );
}

main().catch((err) => {
  process.stderr.write(`[figma-interaction-doc-engine] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});

export { createServer };
