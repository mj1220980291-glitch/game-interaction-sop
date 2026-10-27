import { describe, it, expect } from 'vitest';
import type { NodeInfo } from '../../src/v2/figma-client.js';
import { buildProbeTree } from '../../src/v2/probe/tree.js';
import { DEFAULT_CAPABILITIES } from '../../src/v2/template/schema.js';
import { deriveCapabilities, diffCapabilities } from '../../src/v2/compile/verify-capabilities.js';

function tree(rootId: string, nodes: NodeInfo[]) {
  const t = buildProbeTree(nodes, rootId);
  if (!t) throw new Error('tree build failed');
  return t;
}

describe('diffCapabilities', () => {
  it('逐项比对，只报不同项', () => {
    const produced = { ...DEFAULT_CAPABILITIES, numberBadge: 'instance' as const };
    const diffs = diffCapabilities(DEFAULT_CAPABILITIES, produced);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ key: 'numberBadge', from: 'text', to: 'instance' });
  });

  it('完全一致时无差异', () => {
    expect(diffCapabilities(DEFAULT_CAPABILITIES, { ...DEFAULT_CAPABILITIES })).toEqual([]);
  });
});

describe('deriveCapabilities', () => {
  it('没有任何部件证据 → 沿用源模板值，并明确记缺口', () => {
    const r = deriveCapabilities({ source: { ...DEFAULT_CAPABILITIES, column: 'bottom' } });
    expect(r.capabilities.column).toBe('bottom');
    expect(r.diffs).toEqual([]);
    expect(r.gaps.some((g) => g.what.includes('无法从部件实测'))).toBe(true);
    expect(r.gaps[0]!.what).toContain('column');
  });

  it('有 top 部件时实测总览与职能写法', () => {
    const top = tree('top', [
      { id: 'top', name: '顶部', type: 'FRAME', childIds: ['a', 'b', 'c'] },
      { id: 'a', name: '@策划', type: 'TEXT', characters: '@策划' },
      { id: 'b', name: '@美术', type: 'TEXT', characters: '@美术' },
      { id: 'c', name: '@程序', type: 'TEXT', characters: '@程序' }
    ]);
    const r = deriveCapabilities({ top, source: { ...DEFAULT_CAPABILITIES } });
    expect(r.capabilities.roleAnnotation).toBe('component-variant');
    // 顶部部件看不出总览区，按新规则保留源模板结论，并记一条无法实测。
    expect(r.capabilities.overview).toBe('two-frames');
    expect(r.gaps.some((g) => g.what.includes('overview'))).toBe(true);
  });

  it('顶部看不出总览时不清零 overview，保留源模板结论', () => {
    const top = tree('top', [
      { id: 'top', name: '顶部', type: 'FRAME', childIds: ['a'] },
      { id: 'a', name: '标题', type: 'TEXT', characters: '局内相关交互' }
    ]);
    const r = deriveCapabilities({ top, source: { ...DEFAULT_CAPABILITIES, overview: 'two-frames' } });
    expect(r.capabilities.overview).toBe('two-frames');
    expect(r.diffs.some((d) => d.key === 'overview')).toBe(false);
    expect(r.gaps.some((g) => g.what.includes('overview'))).toBe(true);
  });

  it('顶部看不出成组 @ 时不清零职能写法，保留源模板结论', () => {
    const top = tree('top', [
      { id: 'top', name: '顶部', type: 'FRAME', childIds: ['a'] },
      { id: 'a', name: '标题', type: 'TEXT', characters: '角色系统' }
    ]);
    const r = deriveCapabilities({ top, source: { ...DEFAULT_CAPABILITIES, roleAnnotation: 'inline-suffix' } });
    expect(r.capabilities.roleAnnotation).toBe('inline-suffix');
    expect(r.diffs.some((d) => d.key === 'roleAnnotation')).toBe(false);
  });

  it('章节部件里没有簇 → 编号/标号/分级三项记为无法实测', () => {
    const chapter = tree('ch', [
      { id: 'ch', name: '章节', type: 'FRAME', childIds: ['g', 't'] },
      { id: 'g', name: '图', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 1200, height: 600 } },
      { id: 't', name: '说明', type: 'FRAME', absoluteBoundingBox: { x: 1250, y: 0, width: 900, height: 600 } }
    ]);
    const r = deriveCapabilities({ chapter, source: { ...DEFAULT_CAPABILITIES } });
    const gap = r.gaps.find((g) => g.what.includes('无法从部件实测'))!;
    expect(gap.what).toContain('numberBadge');
    expect(r.capabilities.numberBadge).toBe(DEFAULT_CAPABILITIES.numberBadge);
  });
});
