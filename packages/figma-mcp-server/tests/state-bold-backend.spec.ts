/**
 * 状态行加粗 — backend 插件脚本（setMultipleTextContents / applyOps）。
 *
 * 在模拟的 `figma` 全局下执行 backend 发出的脚本，逐字记录字重。
 *
 * Change: openspec/changes/cluster-order-and-state-block
 */

import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { buildFigmaConsoleBackend } from '../src/server/figmaConsoleBackend.js';

interface FakeFont {
  family: string;
  style: string;
}

interface FakeText {
  id: string;
  characters: string;
  /** One font per character; empty text keeps a single "base" entry. */
  styles: FakeFont[];
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>;

const REG: FakeFont = { family: 'Noto Sans SC', style: 'Regular' };
const BOLD: FakeFont = { family: 'Noto Sans SC', style: 'Bold' };

function text(id: string, characters: string, font: FakeFont = REG): FakeText {
  return { id, characters, styles: Array.from({ length: Math.max(characters.length, 1) }, () => font) };
}

function harness(nodes: FakeText[], available: string[] = ['Regular', 'Medium', 'Bold']) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const loads: string[] = [];

  const figma = {
    getNodeByIdAsync: async (id: string) => {
      const n = byId.get(id);
      if (!n) return null;
      return {
        id: n.id,
        type: 'TEXT',
        get characters() {
          return n.characters;
        },
        set characters(v: string) {
          const first = n.styles[0]!;
          n.characters = v;
          n.styles = Array.from({ length: Math.max(v.length, 1) }, () => first);
        },
        getRangeAllFontNames: () => {
          const seen = new Map(n.styles.map((f) => [`${f.family}/${f.style}`, f]));
          return [...seen.values()];
        },
        setRangeFontName: (start: number, end: number, f: FakeFont) => {
          if (!loads.includes(`${f.family}/${f.style}`)) throw new Error('font not loaded');
          for (let i = start; i < end; i++) n.styles[i] = f;
        }
      };
    },
    loadFontAsync: async (f: FakeFont) => {
      if (!available.includes(f.style)) throw new Error(`font not found: ${f.style}`);
      const k = `${f.family}/${f.style}`;
      if (!loads.includes(k)) loads.push(k);
    }
  };

  const client = {
    callTool: async ({ arguments: args }: { arguments: { code: string } }) => {
      const fn = new AsyncFunction('figma', args.code);
      const result = await fn(figma);
      return {
        content: [
          { type: 'text', text: JSON.stringify({ _mcp: 'fake', success: true, result }) }
        ]
      };
    }
  } as unknown as Client;

  return { backend: buildFigmaConsoleBackend(client), byId, loads };
}

/** `'BBBBRRR'`: B = bold, R = regular, per character. */
function weights(n: FakeText): string {
  return n.styles
    .slice(0, n.characters.length)
    .map((f) => (f.style === 'Bold' ? 'B' : 'R'))
    .join('');
}

describe('setMultipleTextContents — bold', () => {
  it('状态名加粗，其余常规', async () => {
    const h = harness([text('a', 'old')]);
    const r = await h.backend.setMultipleTextContents([
      { nodeId: 'a', characters: '冷却状态：释放后', bold: 4 }
    ]);
    expect(weights(h.byId.get('a')!)).toBe('BBBBRRRR');
    expect(r.boldUnavailable).toEqual([]);
  });

  it('只有名字的状态行整段加粗', async () => {
    const h = harness([text('a', 'old')]);
    await h.backend.setMultipleTextContents([{ nodeId: 'a', characters: '默认状态', bold: 4 }]);
    expect(weights(h.byId.get('a')!)).toBe('BBBB');
  });

  it('bold: 0 把原先粗体开头的文字恢复为常规', async () => {
    const h = harness([text('a', '默认状态', BOLD)]);
    await h.backend.setMultipleTextContents([{ nodeId: 'a', characters: '默认无描边', bold: 0 }]);
    expect(weights(h.byId.get('a')!)).toBe('RRRRR');
  });

  it('不带 bold 时不碰字重，也不额外加载字体', async () => {
    const h = harness([text('a', 'old')]);
    await h.backend.setMultipleTextContents([{ nodeId: 'a', characters: '标题' }]);
    expect(h.loads).toEqual(['Noto Sans SC/Regular']);
  });

  it('粗体只加载一次', async () => {
    const h = harness([text('a', 'x'), text('b', 'x'), text('c', 'x')]);
    await h.backend.setMultipleTextContents([
      { nodeId: 'a', characters: '默认状态', bold: 4 },
      { nodeId: 'b', characters: '选中状态：点击后', bold: 4 },
      { nodeId: 'c', characters: '普通规则', bold: 0 }
    ]);
    expect(h.loads).toEqual(['Noto Sans SC/Regular', 'Noto Sans SC/Bold']);
  });

  it('没有粗体字重时只写文字并报告字体族', async () => {
    const h = harness([text('a', 'old')], ['Regular']);
    const r = await h.backend.setMultipleTextContents([
      { nodeId: 'a', characters: '默认状态', bold: 4 }
    ]);
    expect(h.byId.get('a')!.characters).toBe('默认状态');
    expect(weights(h.byId.get('a')!)).toBe('RRRR');
    expect(r.boldUnavailable).toEqual(['Noto Sans SC']);
  });

  it('退而求其次使用 Medium', async () => {
    const h = harness([text('a', 'old')], ['Regular', 'Medium']);
    await h.backend.setMultipleTextContents([{ nodeId: 'a', characters: '默认状态', bold: 4 }]);
    expect(h.byId.get('a')!.styles.map((f) => f.style)).toEqual(['Medium', 'Medium', 'Medium', 'Medium']);
  });
});

describe('applyOps setText — bold', () => {
  it('普通规则改为状态行、状态行改为普通规则', async () => {
    const h = harness([text('a', '点击后进入冷却'), text('b', '默认状态', BOLD)]);
    const r = await h.backend.applyOps!([
      { op: 'setText', nodeId: 'a', text: '冷却状态：释放后', bold: 4 },
      { op: 'setText', nodeId: 'b', text: '默认无描边', bold: 0 }
    ]);
    expect(r.applied).toBe(2);
    expect(weights(h.byId.get('a')!)).toBe('BBBBRRRR');
    expect(weights(h.byId.get('b')!)).toBe('RRRRR');
  });
});
