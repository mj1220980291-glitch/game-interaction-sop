import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createServer,
  buildNativeTools,
  type CreateServerOptions
} from '../src/server/createServer.js';
import type { FigmaExecuteBackend } from '../src/executor/index.js';

/**
 * Spec: openspec/changes/proxy-figma-console-tools-from-engine/specs/engine-mcp-server/spec.md
 *
 * The server is built on the lower-level `Server` class. Native tool handlers
 * are reachable for unit-level testing via `buildNativeTools(opts)`, which
 * returns the same tool definitions the createServer dispatcher routes to.
 * This avoids needing a full stdio transport for fast tests.
 */

const VALID_YAML = `
meta:
  title: t
  version: 1.0.0
  project: p
  designUrl: https://x.com/y
sections:
  - index: 1
    title: 一
    bubbles:
      - id: "1"
        text: 气泡
        layer: overlay
        anchor: { nodeId: "1:2" }
designRefs:
  - name: ref
    url: https://x.com/y
    nodeId: "1:2"
screenshots: []
`.trim();

class FakeBackend implements FigmaExecuteBackend {
  async status() {
    return { ok: true, version: 'fake' };
  }
  async execute() {
    return { result: { ok: true } };
  }
}

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
  it('registers all 6 native tools (4 legacy v0.1 + 2 v0.2)', () => {
    const defs = buildNativeTools();
    const names = defs.map((d) => d.tool.name).sort();
    expect(names).toEqual(
      [
        'dry_run_layout',
        'generate_interaction_doc',
        'render_v2_markdown_to_figma',
        'replay_from_checkpoint',
        'validate_dsl',
        'validate_v2_markdown'
      ].sort()
    );
  });

  it('createServer returns a Server with tools capability', () => {
    const s = createServer();
    expect(s).toBeDefined();
    // Server class lives in mcp-sdk; we only assert it constructed without
    // throwing. The dispatcher behavior is exercised through buildNativeTools
    // for native tools and through proxy-routing tests for forwarded tools.
  });
});

describe('mcp server — validate_dsl', () => {
  it('returns ok=true for valid yaml', async () => {
    const r = await callTool({}, 'validate_dsl', { yaml: VALID_YAML });
    const body = parseToolBody(r) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns ok=false with errors for invalid yaml', async () => {
    const r = await callTool({}, 'validate_dsl', { yaml: 'sections: []\n' });
    const body = parseToolBody(r) as { ok: boolean; errors: unknown[] };
    expect(body.ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });
});

describe('mcp server — dry_run_layout', () => {
  it('returns plan output for valid yaml', async () => {
    const r = await callTool({}, 'dry_run_layout', { yaml: VALID_YAML });
    const body = parseToolBody(r) as { ok: boolean; plan: { templateChoice: string } };
    expect(body.ok).toBe(true);
    expect(body.plan.templateChoice).toBe('design-driven');
  });
});

describe('mcp server — generate_interaction_doc backend gating', () => {
  it('returns EXECUTOR_BACKEND_UNAVAILABLE when no backend wired', async () => {
    const r = await callTool({}, 'generate_interaction_doc', { yaml: VALID_YAML });
    expect(r.isError).toBe(true);
    const body = parseToolBody(r) as { code: string };
    expect(body.code).toBe('EXECUTOR_BACKEND_UNAVAILABLE');
  });
});

describe('mcp server — generate + replay e2e', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fid-srv-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('generate runs all 7 phases when backend is available', async () => {
    const opts: CreateServerOptions = { backend: new FakeBackend(), storeRoot: tmp };
    const r = await callTool(opts, 'generate_interaction_doc', {
      yaml: VALID_YAML,
      runId: 'srv1'
    });
    expect(r.isError).toBeFalsy();
    const body = parseToolBody(r) as {
      runId: string;
      completedPhases: string[];
    };
    expect(body.runId).toBe('srv1');
    expect(body.completedPhases).toHaveLength(7);
  });

  it('replay reuses checkpoints from previous generate', async () => {
    const opts: CreateServerOptions = { backend: new FakeBackend(), storeRoot: tmp };
    const first = await callTool(opts, 'generate_interaction_doc', {
      yaml: VALID_YAML,
      runId: 'srv1'
    });
    const firstBody = parseToolBody(first) as { runId: string };
    const r = await callTool(opts, 'replay_from_checkpoint', {
      runId: firstBody.runId,
      fromPhase: 4
    });
    expect(r.isError).toBeFalsy();
  });
});
