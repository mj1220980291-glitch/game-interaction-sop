import { describe, it, expect } from 'vitest';
import type { AdoptResult, FigmaBackend } from '../../src/v2/figma-client.js';
import { adoptNestedParts, isFullyAdopted } from '../../src/v2/compile/adopt.js';
import type { BuiltPart } from '../../src/v2/compile/parts.js';

const PARTS = [
  { part: 'top' as const, componentId: 'comp:top', name: 'P / 顶部' }
] satisfies BuiltPart[];

function outcome(patch: Partial<AdoptResult> = {}): AdoptResult {
  return {
    adopted: [],
    sets: [],
    createdInstances: [],
    unresolved: [],
    ...patch
  };
}

function fakeBackend(r: AdoptResult) {
  const seen: Array<{ rootId: string; partsPageId: string }> = [];
  const backend = {
    async adoptInstances(p: { rootId: string; partsPageId: string }) {
      seen.push({ rootId: p.rootId, partsPageId: p.partsPageId });
      return r;
    }
  } as unknown as FigmaBackend;
  return { backend, seen };
}

describe('adoptNestedParts', () => {
  it('逐部件调用收编，聚合结果', async () => {
    const r = outcome({
      adopted: [
        {
          componentId: 'comp:p1',
          name: 'P / 零件 / 三角',
          originalName: 'num',
          originalSetName: null
        }
      ],
      createdInstances: ['inst:new']
    });
    const h = fakeBackend(r);
    const out = await adoptNestedParts({
      backend: h.backend,
      parts: PARTS,
      partsPageId: 'page:parts',
      project: 'P'
    });
    expect(h.seen[0]).toEqual({ rootId: 'comp:top', partsPageId: 'page:parts' });
    expect(out.adopted).toHaveLength(1);
    expect(isFullyAdopted(out)).toBe(true);
    expect(out.gaps.some((g) => g.what.includes('收编 1 个零件'))).toBe(true);
  });

  it('变体名不是 属性=值 → 记缺口', async () => {
    const h = fakeBackend(
      outcome({ sets: [{ setId: 'set:1', name: 'P / 零件 / 标签', variants: ['策划', '职能=美术'] }] })
    );
    const out = await adoptNestedParts({
      backend: h.backend,
      parts: PARTS,
      partsPageId: 'page:parts',
      project: 'P'
    });
    expect(out.gaps.some((g) => g.what.includes('变体名不是'))).toBe(true);
    expect(out.gaps.find((g) => g.what.includes('变体名不是'))!.impact).toContain('切换变体');
  });

  it('有未收编的实例 → 不算通', async () => {
    const h = fakeBackend(outcome({ unresolved: [{ nodeId: 'i9', reason: 'no mainComponent' }] }));
    const out = await adoptNestedParts({
      backend: h.backend,
      parts: PARTS,
      partsPageId: 'page:parts',
      project: 'P'
    });
    expect(isFullyAdopted(out)).toBe(false);
    expect(out.gaps[0]!.what).toContain('未收编');
  });

  it('后端不支持时明确拒绝', async () => {
    const broken = {} as unknown as FigmaBackend;
    await expect(
      adoptNestedParts({
        backend: broken,
        parts: PARTS,
        partsPageId: 'page:parts',
        project: 'P'
      })
    ).rejects.toThrow(/adoptInstances/);
  });
});
