/**
 * 编译期自适应外壳。
 *
 * Spec: openspec/changes/template-adaptive-shell
 */

import { describe, it, expect } from 'vitest';
import { applyAdaptiveLayout } from '../../src/v2/compile/adaptive-layout.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';
import { n, slotsBackend, type SlotsBackend } from './helpers/slots-backend.js';

type Call = Parameters<NonNullable<FigmaBackend['setAutoLayout']>>[0];

function withAutoLayout(h: SlotsBackend): Call[] {
  const calls: Call[] = [];
  (h.backend as unknown as { setAutoLayout: (p: Call) => Promise<void> }).setAutoLayout = async (p) => {
    calls.push(p);
    const root = h.store.get(p.nodeId);
    if (root) root.layoutMode = p.mode;
  };
  return calls;
}

/** 蛋仔章节的真实几何：主图 (0,807) / 说明栏 (1277,786) / 气泡 (0,0)。 */
function chapterFixture() {
  return [
    n('c', '章节', 'COMPONENT', ['img', 'col', 'bubble'], { x: 0, y: 0, w: 2209, h: 6240 }),
    n('img', '主图占位', 'RECTANGLE', [], { x: 0, y: 807, w: 1200, h: 745 }),
    n('col', 'Text', 'FRAME', [], { x: 1277, y: 786, w: 932, h: 6240 }),
    n('bubble', '气泡', 'FRAME', [], { x: 0, y: 0, w: 1920, h: 1080 })
  ];
}

function clusterFixture() {
  return [
    n('k', '簇', 'COMPONENT', ['g'], { x: 0, y: 0, w: 916, h: 197 }),
    n('g', 'Group 1253', 'GROUP', [], { x: 0, y: 0, w: 916, h: 197 })
  ];
}

describe('applyAdaptiveLayout', () => {
  it('章节：横向布局，间距与顶部偏移把现有坐标原样兜住，气泡绝对定位', async () => {
    const h = slotsBackend(chapterFixture());
    const calls = withAutoLayout(h);

    const r = await applyAdaptiveLayout({
      backend: h.backend,
      parts: [{ part: 'chapter', nodeId: 'c' }]
    });

    expect(r.gaps).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      nodeId: 'c',
      mode: 'HORIZONTAL',
      itemSpacing: 77, // 1277 − (0 + 1200)
      padding: { top: 786 }, // min(807, 786)
      hugHeight: true,
      absoluteChildIds: ['bubble']
    });
    expect(r.applied[0]).toMatchObject({ part: 'chapter', paddingTop: 786, absoluteChildren: ['bubble'] });
  });

  it('已是自动布局的部件直接跳过（官方1.14 簇）', async () => {
    const h = slotsBackend([
      n('k', '簇', 'COMPONENT', ['g'], { w: 916, h: 197, layoutMode: 'VERTICAL' }),
      n('g', '标题', 'GROUP', [], { w: 916, h: 197 })
    ]);
    const calls = withAutoLayout(h);

    const r = await applyAdaptiveLayout({ backend: h.backend, parts: [{ part: 'cluster', nodeId: 'k' }] });

    expect(calls).toEqual([]);
    expect(r.skipped).toEqual([{ part: 'cluster', reason: '已经是自动布局' }]);
    expect(r.gaps).toEqual([]);
  });

  it('簇：单子级 → 纵向 HUG', async () => {
    const h = slotsBackend(clusterFixture());
    const calls = withAutoLayout(h);

    const r = await applyAdaptiveLayout({ backend: h.backend, parts: [{ part: 'cluster', nodeId: 'k' }] });

    expect(calls[0]).toMatchObject({ mode: 'VERTICAL', itemSpacing: 0, padding: { top: 0 }, hugHeight: true });
    expect(r.applied).toHaveLength(1);
  });

  it('说明栏排在主图之前 → 记缺口，不动画布', async () => {
    const nodes = chapterFixture();
    const c = nodes[0]!;
    c.childIds = ['col', 'img', 'bubble'];
    const h = slotsBackend(nodes);
    const calls = withAutoLayout(h);

    const r = await applyAdaptiveLayout({ backend: h.backend, parts: [{ part: 'chapter', nodeId: 'c' }] });

    expect(calls).toEqual([]);
    expect(r.gaps[0]!.what).toContain('说明栏排在图区之前');
  });

  it('缺说明栏槽位 → 记缺口，不动画布', async () => {
    const h = slotsBackend([
      n('c', '章节', 'COMPONENT', ['img'], { w: 2209, h: 6240 }),
      n('img', '主图占位', 'RECTANGLE', [], { w: 1200, h: 745 })
    ]);
    const calls = withAutoLayout(h);

    const r = await applyAdaptiveLayout({ backend: h.backend, parts: [{ part: 'chapter', nodeId: 'c' }] });

    expect(calls).toEqual([]);
    expect(r.gaps[0]!.what).toContain('找不到槽位');
  });

  it('后端不支持自动布局 → 一条缺口说清楚后果', async () => {
    const h = slotsBackend(chapterFixture());
    const r = await applyAdaptiveLayout({ backend: h.backend, parts: [{ part: 'chapter', nodeId: 'c' }] });

    expect(r.applied).toEqual([]);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]!.impact).toContain('手工压章节高度');
  });

  it('顶部 / 结尾不参与（固定版式块）', async () => {
    const h = slotsBackend([n('t', '顶部', 'COMPONENT', [], { w: 2205, h: 321 })]);
    const calls = withAutoLayout(h);

    const r = await applyAdaptiveLayout({ backend: h.backend, parts: [{ part: 'top', nodeId: 't' }] });

    expect(calls).toEqual([]);
    expect(r.skipped).toEqual([]);
  });
});
