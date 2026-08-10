/**
 * Stdio entrypoint. Run with `node dist/server/index.js` after build, or
 * `tsx src/server/index.ts` during development.
 *
 * Spec: openspec/changes/proxy-figma-console-tools-from-engine/specs/engine-mcp-server/spec.md
 *
 * Wiring (when FIGMA_BACKEND=figma-console):
 *   1. Spawn `npx -y figma-console-mcp@latest` as a stdio MCP child.
 *   2. Connect to the child as an MCP client.
 *   3. Call `listTools()` to capture every tool the child exposes — these
 *      become "proxy tools" served verbatim to upstream callers via this
 *      engine's MCP server.
 *   4. Build the v2Backend on top of `client.callTool({ name: 'figma_execute' })`.
 *   5. createServer with v2Backend + proxyClient + proxyTools.
 *   6. Bind the engine's stdio server transport so CodeMaker can talk to it.
 *
 * The order matters: by the time CodeMaker sees `tools/list`, the proxy tool
 * list and forwarding wires are already in place.
 *
 * Lifecycle: if the child stdio transport ever closes or errors, this engine
 * process exits with code 1 (fail-fast). CodeMaker will lazy-spawn a fresh
 * engine on the next tool call, which in turn will spawn a fresh child.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from './createServer.js';
import { buildFigmaConsoleBackend } from './figmaConsoleBackend.js';
import { warnOnExternalFigmaConsoleInstances } from './detectExternal.js';

async function main(): Promise<void> {
  let v2Backend = undefined;
  let proxyClient: Client | undefined;
  let proxyTools: Tool[] = [];

  if (process.env.FIGMA_BACKEND === 'figma-console') {
    const token = process.env.FIGMA_ACCESS_TOKEN ?? '';
    const client = new Client({ name: 'figma-interaction-doc-engine', version: '0.1.0' });
    const childTransport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'figma-console-mcp@latest'],
      env: {
        ...process.env,
        FIGMA_ACCESS_TOKEN: token,
        ENABLE_MCP_APPS: 'true'
      }
    });

    // Fail-fast: if the child dies, the engine cannot serve render_v2 nor
    // any proxied figma_* tool. Exit so CodeMaker rebuilds a fresh chain.
    childTransport.onclose = () => {
      process.stderr.write(
        '[figma-interaction-doc-engine] child figma-console-mcp transport closed; exiting so CodeMaker can lazy-respawn\n'
      );
      process.exit(1);
    };
    childTransport.onerror = (err: Error) => {
      process.stderr.write(
        `[figma-interaction-doc-engine] child figma-console-mcp transport error: ${err.message}\n`
      );
      process.exit(1);
    };

    await client.connect(childTransport);

    // Capture the child's tool list once, at startup. The list is stable for
    // the lifetime of the child process; we serve it verbatim to upstream.
    const list = await client.listTools();
    proxyTools = list.tools;
    proxyClient = client;
    v2Backend = buildFigmaConsoleBackend(client);

    process.stderr.write(
      `[figma-interaction-doc-engine] v2Backend wired via figma-console-mcp; ` +
        `${proxyTools.length} child tool(s) will be proxied\n`
    );

    // Best-effort: warn if there is another figma-console-mcp process bound
    // to a port we don't own. This usually means a separate `figma-console`
    // MCP server is also configured in CodeMaker, which will cause the
    // Figma Bridge plugin to connect to the other instance and starve us
    // of plugin access.
    try {
      const childPid = childTransport.pid ?? undefined;
      warnOnExternalFigmaConsoleInstances(childPid);
    } catch (err) {
      process.stderr.write(
        `[figma-interaction-doc-engine] external-instance detection failed: ${(err as Error).message}\n`
      );
    }
  }

  const server = createServer({ v2Backend, proxyClient, proxyTools });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Stderr-only banner so JSON-RPC framing on stdout stays clean.
  process.stderr.write(
    '[figma-interaction-doc-engine] mcp stdio server ready — ' +
      `native: validate_v2_markdown, render_v2_markdown_to_figma; ` +
      `proxy: ${proxyTools.length}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[figma-interaction-doc-engine] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});

export { createServer };
