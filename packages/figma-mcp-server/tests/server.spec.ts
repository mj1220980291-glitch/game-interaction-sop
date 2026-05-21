import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server/createServer.js';
import type { FigmaExecuteBackend } from '../src/executor/index.js';

/**
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/engine-mcp-server/spec.md
 *
 * We test the MCP server by reaching into the underlying low-level Server's
 * registered tools — each registerTool call attaches a callback we can invoke
 * directly without spinning up a stdio transport. This keeps tests fast and
 * avoids node IPC.
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

interface RegisteredTool {
  handler: (args: Record<string, unknown>, extra?: unknown) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
}

function getTool(server: ReturnType<typeof createServer>, name: string): RegisteredTool {
  // Reach into the private registry. The McpServer class stores registered
  // tools on a private field; we accept that boundary for testing.
  const tools = (server as unknown as {
    _registeredTools: Record<string, RegisteredTool>;
  })._registeredTools;
  const t = tools[name];
  if (!t) throw new Error(`tool not registered: ${name}`);
  return t;
}

async function callTool(
  server: ReturnType<typeof createServer>,
  name: string,
  args: Record<string, unknown>
) {
  const tool = getTool(server, name);
  return tool.handler(args, {});
}

function parseToolBody(resp: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(resp.content[0]!.text);
}

describe('mcp server — tool registration', () => {
  it('registers all 6 tools (4 legacy v0.1 + 2 v0.2)', () => {
    const s = createServer();
    const tools = (s as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect(Object.keys(tools).sort()).toEqual(
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
});

describe('mcp server — validate_dsl', () => {
  it('returns ok=true for valid yaml', async () => {
    const s = createServer();
    const r = await callTool(s, 'validate_dsl', { yaml: VALID_YAML });
    const body = parseToolBody(r) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns ok=false with errors for invalid yaml', async () => {
    const s = createServer();
    const r = await callTool(s, 'validate_dsl', { yaml: 'sections: []\n' });
    const body = parseToolBody(r) as { ok: boolean; errors: unknown[] };
    expect(body.ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });
});

describe('mcp server — dry_run_layout', () => {
  it('returns plan output for valid yaml', async () => {
    const s = createServer();
    const r = await callTool(s, 'dry_run_layout', { yaml: VALID_YAML });
    const body = parseToolBody(r) as { ok: boolean; plan: { templateChoice: string } };
    expect(body.ok).toBe(true);
    expect(body.plan.templateChoice).toBe('design-driven');
  });
});

describe('mcp server — generate_interaction_doc backend gating', () => {
  it('returns EXECUTOR_BACKEND_UNAVAILABLE when no backend wired', async () => {
    const s = createServer();
    const r = await callTool(s, 'generate_interaction_doc', { yaml: VALID_YAML });
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
    const s = createServer({ backend: new FakeBackend(), storeRoot: tmp });
    const r = await callTool(s, 'generate_interaction_doc', {
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
    const s = createServer({ backend: new FakeBackend(), storeRoot: tmp });
    await callTool(s, 'generate_interaction_doc', {
      yaml: VALID_YAML,
      runId: 'srv2'
    });
    const r = await callTool(s, 'replay_from_checkpoint', {
      runId: 'srv2',
      fromPhase: 5
    });
    expect(r.isError).toBeFalsy();
    const body = parseToolBody(r) as { completedPhases: string[] };
    expect(body.completedPhases).toEqual([
      'inject-bubbles',
      'inject-screenshots',
      'snapshot-and-report'
    ]);
  });
});
