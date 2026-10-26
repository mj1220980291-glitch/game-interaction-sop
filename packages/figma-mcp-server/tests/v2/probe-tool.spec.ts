/**
 * figma_probe_template MCP 工具。
 *
 * Spec: engine-mcp-server「只读模板探针工具」「探针结果可直接落盘」
 * Change: template-contract-and-probe (task 7.2)
 */

import { describe, it, expect } from 'vitest';
import { buildNativeTools } from '../../src/server/createServer.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { official114, flatten } from './fixtures/probe-trees.js';

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function fakeBackend(root = official114()): { backend: FigmaBackend; writes: string[] } {
  const flat = flatten(root);
  const writes: string[] = [];
  const backend = new Proxy({} as FigmaBackend, {
    get(_t, prop: string) {
      if (prop === 'withFileKey') return undefined;
      if (prop === 'getNodeInfo') {
        return async (id: string) => {
          const hit = flat.find((n) => n.id === id);
          if (!hit) throw new Error('not found');
          return hit;
        };
      }
      if (prop === 'scanSubtree') return async () => ({ nodes: flat, truncated: false });
      return async () => {
        writes.push(prop);
        throw new Error(`probe tool must not write (${prop})`);
      };
    }
  });
  return { backend, writes };
}

async function call(args: Record<string, unknown>, backend: FigmaBackend): Promise<ToolResult> {
  const def = buildNativeTools({ v2Backend: backend }).find((d) => d.tool.name === 'figma_probe_template');
  if (!def) throw new Error('figma_probe_template not registered');
  return (await def.handler(args)) as ToolResult;
}

function body(res: ToolResult): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe('figma_probe_template', () => {
  it('已注册且声明为只读', () => {
    const def = buildNativeTools().find((d) => d.tool.name === 'figma_probe_template');
    expect(def).toBeDefined();
    expect(def!.tool.description).toContain('只读');
  });

  it('返回 ready 报告，且不写画布', async () => {
    const { backend, writes } = fakeBackend();
    const res = await call({ nodeId: '1:14' }, backend);
    const b = body(res);
    expect(b['verdict']).toBe('ready');
    expect(writes).toEqual([]);
    expect(Array.isArray(b['rules'])).toBe(true);
    expect(typeof b['human']).toBe('string');
  });

  it('草案可直接落盘并被解析', async () => {
    const { backend } = fakeBackend();
    const res = await call({ nodeId: '1:14' }, backend);
    const draft = body(res)['draft'];
    const parsed = parseTemplatePack(draft);
    expect(parsed.ok).toBe(true);
  });

  it('缺 nodeId 报参数错误，不退化为扫描当前页', async () => {
    const { backend } = fakeBackend();
    const res = await call({}, backend);
    expect(res.isError).toBe(true);
    expect(body(res)['code']).toBe('INVALID_INPUT');
  });

  it('未配置 backend 时返回 V2_BACKEND_UNAVAILABLE', async () => {
    const def = buildNativeTools().find((d) => d.tool.name === 'figma_probe_template')!;
    const res = (await def.handler({ nodeId: '1:14' })) as ToolResult;
    expect(res.isError).toBe(true);
    expect(body(res)['code']).toBe('V2_BACKEND_UNAVAILABLE');
  });
});
