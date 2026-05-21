import { describe, expect, it } from 'vitest';
import { toParentLocal } from '../src/planner/coords.js';
import { makeOverlayInsert, makeDesignInsert } from '../src/planner/zorder.js';
import { alignScreenshots } from '../src/planner/screenshots.js';
import { chooseTemplate } from '../src/planner/template.js';
import { cleanTitle } from '../src/planner/title.js';

/**
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/layout-planner/spec.md
 */

describe('planner/coords — FRAME-local rule', () => {
  it('subtracts parent box origin when parent is FRAME', () => {
    const local = toParentLocal({ x: 350, y: 500 }, 'FRAME', { x: 100, y: 200 });
    expect(local).toEqual({ x: 250, y: 300 });
  });

  it('passes through when parent is PAGE', () => {
    const local = toParentLocal({ x: 350, y: 500 }, 'PAGE', { x: 100, y: 200 });
    expect(local).toEqual({ x: 350, y: 500 });
  });

  it('handles negative offsets correctly', () => {
    const local = toParentLocal({ x: -50, y: 30 }, 'FRAME', { x: -100, y: -10 });
    expect(local).toEqual({ x: 50, y: 40 });
  });
});

describe('planner/zorder — overlay vs design polarity', () => {
  it('overlay insert uses appendChild (top of render stack)', () => {
    const ins = makeOverlayInsert('parent', 'child');
    expect(ins.op).toBe('appendChild');
    expect(ins.parentId).toBe('parent');
    expect(ins.childId).toBe('child');
  });

  it('design insert uses insertChild(0, ...) (bottom of render stack)', () => {
    const ins = makeDesignInsert('p', 'c');
    expect(ins.op).toBe('insertChild');
    expect(ins.index).toBe(0);
  });
});

describe('planner/screenshots — alignment', () => {
  it('1-to-1 mapping when counts match', () => {
    const r = alignScreenshots(
      [{ index: 1 }, { index: 2 }, { index: 3 }],
      [
        { sectionIndex: 1, src: 'a', alt: 'a' },
        { sectionIndex: 2, src: 'b', alt: 'b' },
        { sectionIndex: 3, src: 'c', alt: 'c' }
      ]
    );
    expect(r.warnings).toEqual([]);
    expect(r.slots.map((s) => s.src)).toEqual(['a', 'b', 'c']);
  });

  it('produces placeholders when fewer images than sections', () => {
    const r = alignScreenshots(
      [{ index: 1 }, { index: 2 }, { index: 3 }, { index: 4 }, { index: 5 }],
      [
        { sectionIndex: 1, src: 'a', alt: '' },
        { sectionIndex: 2, src: 'b', alt: '' },
        { sectionIndex: 3, src: 'c', alt: '' }
      ]
    );
    expect(r.slots[3]?.src).toBeNull();
    expect(r.slots[4]?.src).toBeNull();
    expect(r.warnings.some((w) => w.code === 'SCREENSHOT_FEWER_THAN_SECTIONS')).toBe(true);
  });

  it('truncates and warns when more images than sections', () => {
    const r = alignScreenshots(
      [{ index: 1 }, { index: 2 }],
      [
        { sectionIndex: 1, src: 'a', alt: '' },
        { sectionIndex: 2, src: 'b', alt: '' },
        { sectionIndex: 3, src: 'c', alt: '' }
      ]
    );
    expect(r.slots).toHaveLength(2);
    expect(r.warnings.some((w) => w.code === 'SCREENSHOT_MORE_THAN_SECTIONS')).toBe(true);
  });

  it('keeps first screenshot when multiple target same sectionIndex', () => {
    const r = alignScreenshots(
      [{ index: 1 }],
      [
        { sectionIndex: 1, src: 'first', alt: '' },
        { sectionIndex: 1, src: 'second', alt: '' }
      ]
    );
    expect(r.slots[0]?.src).toBe('first');
  });
});

describe('planner/template — choice', () => {
  it('design-driven when designRefs present', () => {
    expect(chooseTemplate({ designRefCount: 1, screenshotCount: 0 })).toBe('design-driven');
    expect(chooseTemplate({ designRefCount: 2, screenshotCount: 5 })).toBe('design-driven');
  });
  it('blank when only screenshots', () => {
    expect(chooseTemplate({ designRefCount: 0, screenshotCount: 5 })).toBe('blank');
  });
  it('blank when nothing', () => {
    expect(chooseTemplate({ designRefCount: 0, screenshotCount: 0 })).toBe('blank');
  });
});

describe('planner/title — cleanup', () => {
  it('strips numeric prefix', () => {
    expect(cleanTitle('01. 部从选中')).toBe('部从选中');
    expect(cleanTitle('3、部从')).toBe('部从');
  });
  it('strips heading marks', () => {
    expect(cleanTitle('# 部从')).toBe('部从');
    expect(cleanTitle('### 入口')).toBe('入口');
  });
  it('keeps clean title untouched', () => {
    expect(cleanTitle('部从选中')).toBe('部从选中');
  });
  it('trims trailing spaces and full-width spaces', () => {
    expect(cleanTitle('部从选中   ')).toBe('部从选中');
    expect(cleanTitle('部从选中\u3000')).toBe('部从选中');
  });
});
