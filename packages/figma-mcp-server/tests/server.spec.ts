import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createServer,
  buildNativeTools,
  type CreateServerOptions
} from '../src/server/createServer.js';
import { makeBackend } from './v2/helpers/mock-backend.js';

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
  it('registers exactly the native v2 tools', () => {
    const defs = buildNativeTools();
    const names = defs.map((d) => d.tool.name).sort();
    expect(names).toEqual([
      'figma_compile_template',
      'figma_probe_template',
      'render_v2_markdown_to_figma',
      'validate_v2_markdown'
    ]);
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

describe('mcp server — render_v2_markdown_to_figma assetMap (配图键 + crop)', () => {
  it('schema 声明 figma_node 的 crop / scale', () => {
    const def = buildNativeTools().find((d) => d.tool.name === 'render_v2_markdown_to_figma')!;
    const schema = JSON.stringify(def.tool.inputSchema);
    expect(schema).toContain('"crop"');
    expect(schema).toContain('"exclusiveMinimum":0');
    expect(def.tool.description).toContain('NN/C/K');
  });

  it('接受配图键并原样传给渲染器', async () => {
    const m = makeBackend();
    const markdown = VALID_MD;
    const r = await callTool({ v2Backend: m.backend }, 'render_v2_markdown_to_figma', {
      markdown,
      assetMap: {
        '01': { type: 'skip' },
        '01/1/1': {
          type: 'figma_node',
          fileKey: 'f',
          nodeId: 'missing:1',
          crop: { x: 10, y: 20, width: 300, height: 200 }
        }
      }
    });
    expect(r.isError).toBeFalsy();
    const body = parseToolBody(r) as { ok: boolean; warnings: Array<{ code: string; context?: string }> };
    expect(body.ok).toBe(true);
    // 键到达了渲染器：要么匹配上配图后因源缺失失败，要么被判为未匹配——都带键名。
    expect(body.warnings.some((w) => w.context === '01/1/1')).toBe(true);
  });

  it.each([
    [{ x: 0, y: 0, width: 0, height: 10 }],
    [{ x: 0, y: 0, width: 10, height: -1 }],
    [{ x: 'a', y: 0, width: 10, height: 10 }]
  ])('拒绝非法 crop %j', async (crop) => {
    const m = makeBackend();
    const r = await callTool({ v2Backend: m.backend }, 'render_v2_markdown_to_figma', {
      markdown: VALID_MD,
      assetMap: { '01/1/1': { type: 'figma_node', fileKey: 'f', nodeId: '1:1', crop } }
    });
    expect(r.isError).toBe(true);
    expect((parseToolBody(r) as { code: string }).code).toBe('INVALID_INPUT');
  });
});

describe('mcp server — render_v2_markdown_to_figma 同步模式参数', () => {
  it('schema 声明 rootId / scope / dryRun，描述说明同步模式', () => {
    const def = buildNativeTools().find((d) => d.tool.name === 'render_v2_markdown_to_figma')!;
    const schema = JSON.stringify(def.tool.inputSchema);
    expect(schema).toContain('"rootId"');
    expect(schema).toContain('"scope"');
    expect(schema).toContain('"dryRun"');
    expect(def.tool.description).toContain('rootId');
    expect(def.tool.description).toContain('conflicts');
  });

  it.each([
    [{ scope: '03' }],
    [{ dryRun: true }],
    [{ scope: '3', target: { rootId: 'x' } }],
    [{ scope: '03/', target: { rootId: 'x' } }],
    [{ dryRun: 'yes', target: { rootId: 'x' } }]
  ])('拒绝 %j', async (extra) => {
    const m = makeBackend();
    const r = await callTool({ v2Backend: m.backend }, 'render_v2_markdown_to_figma', {
      markdown: VALID_MD,
      ...extra
    });
    expect(r.isError).toBe(true);
    expect((parseToolBody(r) as { code: string }).code).toBe('INVALID_INPUT');
  });

  it('首次渲染返回 mode:create，带 rootId 的同步返回 mode:reconcile', async () => {
    const m = makeBackend();
    const first = parseToolBody(
      await callTool({ v2Backend: m.backend }, 'render_v2_markdown_to_figma', { markdown: VALID_MD })
    ) as { ok: boolean; mode: string; rootInstanceId: string };
    expect(first.mode).toBe('create');

    const second = parseToolBody(
      await callTool({ v2Backend: m.backend }, 'render_v2_markdown_to_figma', {
        markdown: VALID_MD,
        target: { rootId: first.rootInstanceId },
        dryRun: true
      })
    ) as { ok: boolean; mode: string; changes: unknown[]; conflicts: unknown[] };
    expect(second.ok).toBe(true);
    expect(second.mode).toBe('reconcile');
    expect(second.changes).toEqual([]);
    expect(second.conflicts).toEqual([]);
  });
});
