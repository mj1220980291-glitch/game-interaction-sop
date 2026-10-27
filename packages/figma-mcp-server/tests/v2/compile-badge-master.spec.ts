/**
 * 标号母版收口。
 *
 * 容器里必须恰好留一个隐藏母版 `标号/母版`：多个标号要收口，没有母版要记缺口，
 * 否则渲染期要么画不出标号，要么把原稿的 8 个标号一起带进新文档。
 *
 * Spec: template-compile「标号母版收口」
 */

import { describe, it, expect } from 'vitest';
import { ensureBadgeMaster } from '../../src/v2/compile/badge-container.js';
import { BADGE_MASTER_NAME } from '../../src/v2/template-slots.js';
import { n, slotsBackend } from './helpers/slots-backend.js';

function badge(id: string, name: string): ReturnType<typeof n>[] {
  return [
    n(id, name, 'FRAME', [`${id}-t`], { w: 48, h: 48 }),
    n(`${id}-t`, '#Number', 'TEXT', [], { text: '1', w: 40, h: 40 })
  ];
}

function chapterWith(children: Array<ReturnType<typeof n>>, badgeIds: string[]) {
  return [
    n('comp', '章节', 'COMPONENT', ['bubble'], { w: 2209, h: 6240 }),
    n('bubble', '气泡', 'FRAME', badgeIds, { w: 1920, h: 1080 }),
    ...children
  ];
}

describe('ensureBadgeMaster', () => {
  it('多个标号收成唯一隐藏母版', async () => {
    const h = slotsBackend(
      chapterWith(
        [...badge('b1', '标号/1'), ...badge('b2', '标号/2'), ...badge('b3', '标号/3')],
        ['b1', 'b2', 'b3']
      )
    );
    const r = await ensureBadgeMaster({ backend: h.backend, chapterComponentId: 'comp' });
    expect(r.applied).toBe(true);
    expect(r.masterId).toBe('b1');
    expect(r.removed).toEqual(['b2', 'b3']);
    expect(h.store.get('b1')!.name).toBe(BADGE_MASTER_NAME);
    expect(h.store.get('b1')!.visible).toBe(false);
    expect(h.store.get('b2')).toBeUndefined();
    expect(h.store.get('b2-t')).toBeUndefined();
  });

  it('已有母版时只补隐藏，不再改名', async () => {
    const h = slotsBackend(chapterWith(badge('b1', BADGE_MASTER_NAME), ['b1']));
    const r = await ensureBadgeMaster({ backend: h.backend, chapterComponentId: 'comp' });
    expect(r.removed).toEqual([]);
    expect(r.applied).toBe(true);
    expect(h.renamed).toEqual([]);
    expect(h.store.get('b1')!.visible).toBe(false);
  });

  it('容器里没有标号母版时记缺口', async () => {
    const h = slotsBackend(chapterWith([], []));
    const r = await ensureBadgeMaster({ backend: h.backend, chapterComponentId: 'comp' });
    expect(r.applied).toBe(false);
    expect(r.masterId).toBeUndefined();
    expect(r.gaps[0]!.impact).toContain('BADGE_MASTER_MISSING');
    expect(h.writes).toEqual([]);
  });

  it('没有标号容器时记缺口', async () => {
    const h = slotsBackend([n('comp', '章节', 'COMPONENT', [], { w: 100, h: 100 })]);
    const r = await ensureBadgeMaster({ backend: h.backend, chapterComponentId: 'comp' });
    expect(r.applied).toBe(false);
    expect(r.gaps[0]!.what).toContain('标号容器');
  });
});
