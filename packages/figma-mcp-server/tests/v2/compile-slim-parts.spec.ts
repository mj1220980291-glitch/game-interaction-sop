/**
 * 编译期部件空壳化。
 *
 * Spec: openspec/changes/template-compile-slim-parts
 */

import { describe, it, expect } from 'vitest';
import { slimParts } from '../../src/v2/compile/slim-parts.js';
import { n, slotsBackend } from './helpers/slots-backend.js';

function chapter() {
  return [
    n('c', '章节', 'COMPONENT', ['host', 'bubble'], { w: 2209, h: 6240 }),
    n('host', 'Text', 'FRAME', ['cl1', 'cl2', 'cl3'], { w: 932, h: 6240 }),
    n('cl1', 'Frame 1243', 'FRAME', ['t1'], { w: 900, h: 700 }),
    n('t1', '正文/规则', 'TEXT', [], { text: '旧内容一', w: 800, h: 44 }),
    n('cl2', 'Frame 1245', 'FRAME', ['t2'], { w: 900, h: 700 }),
    n('t2', '正文/规则', 'TEXT', [], { text: '旧内容二', w: 800, h: 44 }),
    n('cl3', 'Frame 1244', 'FRAME', ['t3'], { w: 900, h: 700, visible: false }),
    n('t3', '正文/规则', 'TEXT', [], { text: '隐藏池', w: 800, h: 44 }),
    n('bubble', '气泡', 'FRAME', ['m', 's1', 's2'], { w: 1920, h: 1080 }),
    n('m', '标号/母版', 'FRAME', ['mn'], { w: 48, h: 48, visible: false }),
    n('mn', '#Number', 'TEXT', [], { text: '0', w: 40, h: 40 }),
    n('s1', '标号/1', 'FRAME', ['s1t'], { w: 48, h: 48 }),
    n('s1t', '#Number', 'TEXT', [], { text: '1', w: 40, h: 40 }),
    n('s2', '标号/2', 'FRAME', ['s2t'], { w: 48, h: 48 }),
    n('s2t', '#Number', 'TEXT', [], { text: '2', w: 40, h: 40 })
  ];
}

function cluster() {
  return [
    n('k', '簇', 'COMPONENT', ['num', 'title', 'b1', 'b2', 'b3', 'h1'], { w: 932, h: 867 }),
    n('num', 'Number', 'TEXT', [], { text: '1', w: 40, h: 40 }),
    n('title', '#Title_Main', 'TEXT', [], { text: '序号', w: 200, h: 44 }),
    n('b1', '正文/规则', 'TEXT', [], { text: '第一条', w: 800, h: 44 }),
    n('b2', '正文/规则', 'TEXT', [], { text: '第二条', w: 800, h: 44 }),
    n('b3', '正文/规则', 'TEXT', [], { text: '第三条', w: 800, h: 44 }),
    n('h1', '正文/规则', 'TEXT', [], { text: '备用', w: 800, h: 44, visible: false })
  ];
}

describe('slimParts', () => {
  it('章节清空说明栏、标号只留母版', async () => {
    const h = slotsBackend(chapter());
    const r = await slimParts({
      backend: h.backend,
      parts: [{ part: 'chapter', nodeId: 'c' }]
    });

    expect(h.childrenOf('host')).toHaveLength(0);
    const bubbleKids = h.childrenOf('bubble').map((x) => x.name);
    expect(bubbleKids).toEqual(['标号/母版']);
    expect(r.deleted).toBe(3 + 2);
  });

  it('簇只留一条可见内容行，隐藏池保留', async () => {
    const h = slotsBackend(cluster());
    const r = await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }]
    });

    console.log('kids', h.childrenOf('k').map(x=>x.name+':'+x.visible));
    const bullets = h.childrenOf('k').filter((x) => x.name === '正文/规则');
    expect(bullets.filter((x) => x.visible !== false)).toHaveLength(1);
    expect(bullets.filter((x) => x.visible === false)).toHaveLength(1);
    expect(r.deleted).toBe(2);
  });

  it('缺说明栏时只记缺口，不动画布', async () => {
    const h = slotsBackend([n('c2', '章节', 'COMPONENT', ['x'], { w: 100, h: 100 })]);
    const r = await slimParts({
      backend: h.backend,
      parts: [{ part: 'chapter', nodeId: 'c2' }]
    });
    expect(r.deleted).toBe(0);
    expect(r.gaps[0]!.what).toContain('说明栏');
    expect(h.writes).toEqual([]);
  });
});
