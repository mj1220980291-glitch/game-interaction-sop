import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createServer,
  buildNativeTools,
  type CreateServerOptions
} from '../src/server/createServer.js';

/**
 * Spec: openspec/specs/engine-mcp-server/spec.md
 *
 * The server is built on the lower-level `Server` class. Native tool handlers
 * are reachable for unit-level testing via `buildNativeTools(opts)`, which
 * returns the same tool definitions the createServer dispatcher routes to.
 * This avoids needing a full stdio transport for fast tests.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALID_MD = readFileSync(join(__dirname, 'v2', 'fixtures', 'buzhong.md'), 'utf8');

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

async function callTool(
  opts: CreateServerOptions,
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const defs = buildNativeTools(opts);
  const def = defs.find((d) => d.tool.name === name);
  if (!def) throw new Error(`tool not registered: ${name}`);
  return (await def.handler(args)) as ToolResult;
}

function parseToolBody(resp: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(resp.content[0]!.text);
}

describe('mcp server — tool registration', () => {
  it('registers exactly the 2 v2 native tools', () => {
    const defs = buildNativeTools();
    const names = defs.map((d) => d.tool.name).sort();
    expect(names).toEqual(['render_v2_markdown_to_figma', 'validate_v2_markdown']);
  });

  it('does not register any removed gen-1 DSL tool', () => {
    const defs = buildNativeTools();
    const names = defs.map((d) => d.tool.name);
    for (const removed of [
      'validate_dsl',
      'dry_run_layout',
      'generate_interaction_doc',
      'replay_from_checkpoint'
    ]) {
      expect(names).not.toContain(removed);
    }
  });

  it('createServer returns a Server with tools capability', () => {
    const s = createServer();
    expect(s).toBeDefined();
    // Server class lives in mcp-sdk; we only assert it constructed without
    // throwing. The dispatcher behavior is exercised through buildNativeTools
    // for native tools and through proxy-routing tests for forwarded tools.
  });
});

describe('mcp server — validate_v2_markdown', () => {
  it('returns ok=true for valid markdown', async () => {
    const r = await callTool({}, 'validate_v2_markdown', { markdown: VALID_MD });
    const body = parseToolBody(r) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns ok=false with errors for markdown without sections', async () => {
    const r = await callTool({}, 'validate_v2_markdown', { markdown: '# 空文档\n' });
    const body = parseToolBody(r) as { ok: boolean; errors: unknown[] };
    expect(body.ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });
});

describe('mcp server — render_v2_markdown_to_figma backend gating', () => {
  it('returns V2_BACKEND_UNAVAILABLE when no v2Backend wired', async () => {
    const r = await callTool({}, 'render_v2_markdown_to_figma', { markdown: VALID_MD });
    expect(r.isError).toBe(true);
    const body = parseToolBody(r) as { code: string };
    expect(body.code).toBe('V2_BACKEND_UNAVAILABLE');
  });
});
