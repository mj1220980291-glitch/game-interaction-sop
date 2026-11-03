/**
 * 章节左列必须保持 HUG（真机 2026-11-03 回归）。
 *
 * create 后左列 1200 HUG，跑几次 reconcile 就变成 6716 / 10917 FIXED ——
 * 原因是 `stretchLeftColumn`（两列底边对齐的老逻辑）把 HUG 改成了固定高，
 * 而同步收尾没有复位。这里锁两条：不再拉伸自动布局章节，且收尾能复位。
 *
 * Spec: template-render「章节高度 SHALL 由内容决定，不被相邻栏目拉长」
 */

import { describe, it, expect } from 'vitest';
import { partsBackend, type PNodeSpec } from './helpers/parts-backend.js';
import {
  refreshChapterGeometry,
  stretchLeftColumn
} from '../../src/v2/render/parts/geometry.js';

function chapter(): PNodeSpec {
  return {
    id: 'ch',
    name: '界面说明1',
    type: 'COMPONENT',
    width: 3382,
    height: 8000,
    layoutMode: 'HORIZONTAL',
    children: [
      {
        id: 'left',
        name: '左列',
        type: 'FRAME',
        width: 1920,
        height: 8000, // 被拉成整章高
        layoutMode: 'VERTICAL',
        children: [
          { id: 'title', name: '#Name', type: 'TEXT', characters: '界面', width: 1920, height: 120, x: 0, y: 0 },
          { id: 'stage', name: '舞台', type: 'FRAME', width: 1920, height: 1080, x: 0, y: 120 }
        ]
      },
      {
        id: 'right',
        name: 'Text',
        type: 'FRAME',
        width: 1231,
        height: 8000,
        layoutMode: 'VERTICAL',
        children: []
      }
    ]
  };
}

describe('章节左列自适应', () => {
  it('自动布局章节不再被拉伸（HUG 保命）', async () => {
    const h = partsBackend(chapter());
    await stretchLeftColumn(h.backend, 'ch');
    expect(h.nodes.get('left')!.height).toBe(8000);
    expect(h.calls.some((c) => c.startsWith('resize:left'))).toBe(false);
  });

  it('非自动布局章节保留底边对齐（老模板）', async () => {
    const spec = chapter();
    spec.layoutMode = undefined;
    const h = partsBackend(spec);
    await refreshChapterGeometry(h.backend, 'ch');
    // 老路径仍按「最高的子级」对齐，不代表新行为回归
    expect(h.nodes.get('left')!.height).toBeGreaterThan(0);
  });

  it('收尾归一能把被拉长的左列复位到内容高', async () => {
    const h = partsBackend(chapter());
    const r = await h.backend.normalizeChapterLayout!({ chapterId: 'ch' });
    expect(r.ok).toBe(true);
    expect(h.nodes.get('left')!.height).toBe(1200); // 标题 120 + 舞台 1080
  });
});
