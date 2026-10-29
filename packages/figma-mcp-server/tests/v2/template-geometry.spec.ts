/**
 * 模板几何与色彩：包里怎么写、坏字段怎么退化、渲染怎么用。
 *
 * Spec: openspec/changes/template-geometry-capture
 */

import { describe, it, expect } from 'vitest';
import { parseTemplatePack, DEFAULT_CAPABILITIES } from '../../src/v2/template/schema.js';
import { placeholderPaint } from '../../src/v2/render/parts/index.js';

function pack(extra: Record<string, unknown> = {}) {
  return parseTemplatePack({
    schema_version: 1,
    project: 'demo',
    source: { fileKey: 'f', nodeIds: ['1:1'] },
    components: { top: 'a', chapter: 'b', cluster: 'c', footer: null },
    capabilities: { ...DEFAULT_CAPABILITIES },
    anchors: {},
    ...extra
  });
}

describe('geometry 解析', () => {
  it('没写 geometry 时为空（老包不受影响）', () => {
    const r = pack();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pack.geometry).toBeUndefined();
  });

  it('完整的 geometry 原样读出来', () => {
    const r = pack({
      geometry: {
        docBackground: '#1A1A1A',
        chapterWidth: 3690,
        mainImage: { width: 1200, height: 719 },
        placeholder: { fill: '#2A2A2A', stroke: '#4A4A4A' },
        bubbleGrid: [
          { x: 0.5, y: 0.0556 },
          { x: 0.5, y: 0.1667 }
        ],
        badgeSize: { width: 48, height: 48 },
        rootGap: 12
      }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.geometry?.docBackground).toBe('#1A1A1A');
    expect(r.pack.geometry?.mainImage).toEqual({ width: 1200, height: 719 });
    expect(r.pack.geometry?.bubbleGrid).toHaveLength(2);
    expect(r.pack.geometry?.rootGap).toBe(12);
  });

  it('单个字段坏掉只丢它自己', () => {
    const r = pack({
      geometry: {
        docBackground: '#1A1A1A',
        mainImage: { width: 1200 },
        bubbleGrid: [{ x: 0.5, y: 0.1 }],
        rootGap: -3
      }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.geometry?.docBackground).toBe('#1A1A1A');
    expect(r.pack.geometry?.mainImage).toBeUndefined();
    expect(r.pack.geometry?.rootGap).toBeUndefined();
    expect(r.pack.geometry?.bubbleGrid).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes('geometry.mainImage'))).toBe(true);
  });

  it('网格里混入非数字坐标 → 整段丢弃', () => {
    const r = pack({ geometry: { bubbleGrid: [{ x: 0.5, y: 0.1 }, { x: 'a', y: 0.2 }] } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pack.geometry?.bubbleGrid).toBeUndefined();
  });
});

describe('占位色', () => {
  it('没有实测色时按底色亮度算', () => {
    expect(placeholderPaint('#FFFFFF').fill).not.toBe('#F5F5F5'.toLowerCase());
    expect(placeholderPaint(undefined).fill).toBe('#F5F5F5');
  });

  it('有实测色直接用，不猜', () => {
    const paint = placeholderPaint('#FFFFFF', { fill: '#2A2A2A', stroke: '#4A4A4A' });
    expect(paint).toEqual({ fill: '#2A2A2A', stroke: '#4A4A4A' });
  });
});
