/**
 * setMultipleTextContents — 字体按 family+style 去重加载。
 *
 * 捕获 backend 发给 figma_execute 的插件端脚本，在模拟的 `figma` 全局下执行，
 * 统计 loadFontAsync 调用次数。
 *
 * Change: openspec/changes/engine-font-load-dedupe
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
  type: 'TEXT' | 'FRAME';
  characters: string;
  fonts: FakeFont[];
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>;

function harness(nodes: FakeText[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const loads: string[] = [];
  const loaded = new Set<string>();
  const writesBeforeLoad: string[] = [];

  const figma = {
    getNodeByIdAsync: async (id: string) => {
      const n = byId.get(id);
      if (!n) return null;
      return {
        id: n.id,
        type: n.type,
        get characters() {
          return n.characters;
        },
        set characters(v: string) {
          for (const f of n.fonts) {
            if (!loaded.has(`${f.family}/${f.style}`)) writesBeforeLoad.push(n.id);
          }
          n.characters = v;
        },
        getRangeAllFontNames: () => n.fonts
      };
    },
    loadFontAsync: async (f: FakeFont) => {
      const k = `${f.family}/${f.style}`;
      loads.push(k);
      loaded.add(k);
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

  return { backend: buildFigmaConsoleBackend(client), loads, writesBeforeLoad, byId };
}

const NOTO: FakeFont = { family: 'Noto Sans SC', style: 'Regular' };
const NOTO_BOLD: FakeFont = { family: 'Noto Sans SC', style: 'Bold' };
const INTER: FakeFont = { family: 'Inter', style: 'Regular' };

describe('setMultipleTextContents — 字体去重加载', () => {
  it('同字体 47 个节点只加载 1 次，全部写入', async () => {
    const nodes: FakeText[] = Array.from({ length: 47 }, (_, i) => ({
      id: `t${i}`,
      type: 'TEXT',
      characters: 'old',
      fonts: [NOTO]
    }));
    const h = harness(nodes);

    await h.backend.setMultipleTextContents(
      nodes.map((n) => ({ nodeId: n.id, characters: `new-${n.id}` }))
    );

    expect(h.loads).toEqual(['Noto Sans SC/Regular']);
    expect(h.writesBeforeLoad).toEqual([]);
    expect(nodes.every((n) => n.characters === `new-${n.id}`)).toBe(true);
  });

  it('3 种字体（含单节点混合字体）恰好加载 3 次', async () => {
    const nodes: FakeText[] = [
      { id: 'a', type: 'TEXT', characters: 'x', fonts: [NOTO] },
      { id: 'b', type: 'TEXT', characters: 'x', fonts: [NOTO, NOTO_BOLD] },
      { id: 'c', type: 'TEXT', characters: 'x', fonts: [INTER] },
      { id: 'd', type: 'TEXT', characters: 'x', fonts: [NOTO_BOLD, INTER] }
    ];
    const h = harness(nodes);

    await h.backend.setMultipleTextContents(
      nodes.map((n) => ({ nodeId: n.id, characters: 'y' }))
    );

    expect([...h.loads].sort()).toEqual([
      'Inter/Regular',
      'Noto Sans SC/Bold',
      'Noto Sans SC/Regular'
    ]);
    expect(h.writesBeforeLoad).toEqual([]);
  });

  it('不存在或非 TEXT 的节点被跳过，其余正常写入', async () => {
    const nodes: FakeText[] = [
      { id: 'ok', type: 'TEXT', characters: 'x', fonts: [NOTO] },
      { id: 'frame', type: 'FRAME', characters: 'x', fonts: [INTER] }
    ];
    const h = harness(nodes);

    await h.backend.setMultipleTextContents([
      { nodeId: 'missing', characters: 'y' },
      { nodeId: 'frame', characters: 'y' },
      { nodeId: 'ok', characters: 'y' }
    ]);

    expect(h.loads).toEqual(['Noto Sans SC/Regular']);
    expect(h.byId.get('ok')!.characters).toBe('y');
    expect(h.byId.get('frame')!.characters).toBe('x');
  });
});
