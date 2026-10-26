import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { buildFigmaConsoleBackend } from '../../src/server/figmaConsoleBackend.js';
import {
  COMPILE_FONT_FAMILY,
  COMPILE_FONT_STYLES,
  buildWeightMap,
  mapFontStyle
} from '../../src/v2/compile/font-normalize.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>;

interface Seg {
  start: number;
  end: number;
  family: string;
  style: string;
}

/** 一个混排 TEXT：'AB' 用项目字体 Light，'CD' 用 SemiBold。 */
function textHarness(segs: Seg[]) {
  const loads: string[] = [];
  const writes: string[] = [];
  const node = {
    id: 't1',
    type: 'TEXT',
    characters: 'ABCD',
    getStyledTextSegments: () => segs.map((s) => ({
      start: s.start,
      end: s.end,
      fontName: { family: s.family, style: s.style }
    })),
    setRangeFontName: (start: number, end: number, f: { family: string; style: string }) => {
      writes.push(`${start}-${end}:${f.family}/${f.style}`);
    }
  };

  const figma = {
    getNodeByIdAsync: async (id: string) => (id === 't1' ? node : null),
    loadFontAsync: async (f: { family: string; style: string }) => {
      if (!(COMPILE_FONT_STYLES as readonly string[]).includes(f.style)) {
        throw new Error(`font not found: ${f.style}`);
      }
      loads.push(`${f.family}/${f.style}`);
    }
  };

  const client = {
    callTool: async ({ arguments: args }: { arguments: { code: string } }) => {
      const fn = new AsyncFunction('figma', args.code);
      const result = await fn(figma);
      return { content: [{ type: 'text', text: JSON.stringify({ _mcp: 'f', success: true, result }) }] };
    }
  } as unknown as Client;

  return { backend: buildFigmaConsoleBackend(client), loads, writes };
}

describe('normalizeFontsInSubtree（插件脚本）', () => {
  it('按段改字体族、字重就近映射、原字重不在表内记缺口', async () => {
    const h = textHarness([
      { start: 0, end: 2, family: 'U5Font', style: 'Light' },
      { start: 2, end: 4, family: 'U5Font', style: 'SemiBold' }
    ]);
    const r = await h.backend.normalizeFontsInSubtree!({
      rootId: 't1',
      family: COMPILE_FONT_FAMILY,
      weightMap: buildWeightMap()
    });

    expect(r.changed).toBe(2);
    expect(h.writes).toEqual([
      '0-2:Noto Sans SC/Regular',
      '2-4:Noto Sans SC/Medium'
    ]);
    expect(r.unmapped.map((u) => u.from)).toEqual(['U5Font/Light', 'U5Font/SemiBold']);
    expect(h.loads).toEqual(['Noto Sans SC/Regular', 'Noto Sans SC/Medium']);
  });

  it('已是目标字体时不写、不报缺口', async () => {
    const h = textHarness([{ start: 0, end: 4, family: 'Noto Sans SC', style: 'Bold' }]);
    const r = await h.backend.normalizeFontsInSubtree!({
      rootId: 't1',
      family: COMPILE_FONT_FAMILY,
      weightMap: buildWeightMap()
    });
    expect(r.changed).toBe(0);
    expect(r.unmapped).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
  });
});

describe('字体归一化映射', () => {
  it('目标家族与三档字重', () => {
    expect(COMPILE_FONT_FAMILY).toBe('Noto Sans SC');
    expect([...COMPILE_FONT_STYLES]).toEqual(['Regular', 'Medium', 'Bold']);
  });

  it('同名档位不记为映射', () => {
    expect(mapFontStyle('Regular')).toEqual({ style: 'Regular', mapped: true });
    expect(mapFontStyle('Bold')).toEqual({ style: 'Bold', mapped: true });
  });

  it('项目字体字重就近落地并标记为映射', () => {
    expect(mapFontStyle('Light')).toEqual({ style: 'Regular', mapped: false });
    expect(mapFontStyle('SemiBold')).toEqual({ style: 'Medium', mapped: false });
    expect(mapFontStyle('Black')).toEqual({ style: 'Bold', mapped: false });
  });

  it('大小写与分隔符不敏感', () => {
    expect(mapFontStyle('semi_bold')).toEqual({ style: 'Medium', mapped: false });
    expect(mapFontStyle(' Extra Bold ')).toEqual({ style: 'Bold', mapped: false });
  });

  it('未知字重退 Regular', () => {
    expect(mapFontStyle('U5-Bold')).toEqual({ style: 'Regular', mapped: false });
  });
});
