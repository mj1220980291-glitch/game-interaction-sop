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

  it('run 内的正文条数保持模板原样，隐藏池保留', async () => {
    const h = slotsBackend(cluster());
    const r = await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }]
    });

    const bullets = h.childrenOf('k').filter((x) => x.name === '正文/规则');
    expect(bullets.filter((x) => x.visible !== false)).toHaveLength(3);
    expect(bullets.filter((x) => x.visible === false)).toHaveLength(1);
    expect(r.deleted).toBe(0);
    // 没有 #Title：切不出 run，编译期会拒绝，这里只记缺口。
    expect(r.gaps.some((g) => g.what.includes('切不出完整 run'))).toBe(true);
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

/**
 * 蛋仔的簇带 3 张原稿截图 + 1 张按钮截图。`figure = none` 时渲染不消费配图位，
 * 留着就是每簇挂 3 个空框（真机截图抓到过）。
 */
function clusterWithShots() {
  return [
    n('k', '簇', 'COMPONENT', ['title', 'b1', 's1', 's2', 's3', 'icon'], { w: 916, h: 1417 }),
    n('title', '#Title_Main', 'TEXT', [], { text: '撤离', w: 72, h: 52 }),
    n('b1', '正文/规则', 'TEXT', [], { text: '规则一', w: 872, h: 129 }),
    n('s1', 'Frame 632', 'INSTANCE', [], { w: 872, h: 490 }),
    n('s2', 'Group 427319372', 'GROUP', ['i1'], { w: 872, h: 490 }),
    n('i1', 'Frame 537', 'INSTANCE', [], { w: 872, h: 490 }),
    n('s3', 'Frame 629', 'INSTANCE', [], { w: 872, h: 490 }),
    n('icon', 'image 37982', 'RECTANGLE', [], { w: 127, h: 123, hasImageFill: true })
  ];
}

describe('slimParts · 簇内原稿媒体', () => {
  it('figure = none：原稿截图与图片填充全删（含嵌套）', async () => {
    const h = slotsBackend(clusterWithShots());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'none', figure: 'none' }
    });

    expect(h.childrenOf('k').map((x) => x.name)).toEqual(['#Title_Main', '正文/规则']);
    expect(h.writes.filter((w) => w.startsWith('placeholder:'))).toEqual([]);
  });

  it('有配图位：只留最大的一个，并归一成 GROUP', async () => {
    const h = slotsBackend([
      n('k', '簇', 'COMPONENT', ['title', 'b1', 'small', 'big'], { w: 916, h: 1417 }),
      n('title', '#Title_Main', 'TEXT', [], { text: '撤离', w: 72, h: 52 }),
      n('b1', '正文/规则', 'TEXT', [], { text: '规则一', w: 872, h: 129 }),
      n('small', 'Frame 629', 'INSTANCE', [], { w: 400, h: 300 }),
      n('big', 'Frame 632', 'INSTANCE', [], { w: 872, h: 490 })
    ]);
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'none', figure: 'named-group' }
    });

    expect(h.childrenOf('k').map((x) => x.name)).toEqual(['#Title_Main', '正文/规则', '配图']);
    const group = h.childrenOf('k').find((x) => x.name === '配图')!;
    expect(group.type).toBe('GROUP');
    expect(h.childrenOf(group.id).map((x) => x.name)).toEqual([
      '配图占位',
      '配图占位文案'
    ]);
    expect(h.writes).toContain('group:' + group.id + ':配图');
  });

  it('隐藏备用池里的媒体不动', async () => {
    const h = slotsBackend([
      n('k', '簇', 'COMPONENT', ['title', 'b1', 'pool'], { w: 916, h: 1417 }),
      n('title', '#Title_Main', 'TEXT', [], { text: '撤离', w: 72, h: 52 }),
      n('b1', '正文/规则', 'TEXT', [], { text: '规则一', w: 872, h: 129 }),
      n('pool', '隐藏池', 'GROUP', ['shot'], { w: 872, h: 490, visible: false }),
      n('shot', 'Frame 631', 'INSTANCE', [], { w: 872, h: 490 })
    ]);
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'none', figure: 'none' }
    });

    expect(h.childrenOf('k').map((x) => x.name)).toEqual(['#Title_Main', '正文/规则', '隐藏池']);
  });

  it('簇标题让位给编号，水平保持靠左，角标与文字按中线对齐', async () => {
    const h = slotsBackend([
      n('k', '簇', 'COMPONENT', ['g'], { w: 916, h: 400 }),
      n('g', 'Group', 'GROUP', ['title', 'num', 'b1'], { w: 916, h: 400 }),
      n('title', '#Title_Main', 'TEXT', [], { text: '簇标题', w: 180, h: 52, x: 47, y: 0 }),
      n('num', 'Number', 'INSTANCE', [], { w: 63, h: 63, x: 0, y: 0 }),
      n('b1', '正文/规则', 'TEXT', [], { text: '正文占位', w: 872, h: 129 })
    ]);
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'none', figure: 'none' }
    });

    // 编号 0..63 + 8 间距 = 71：标题让位到 71，但整组仍贴左（不居中）。
    expect(h.store.get('num')!.x).toBe(0);
    expect(h.store.get('title')!.x).toBe(71);
    // 标题 52 高、角标 63 高 → 角标上移 5.5 让两者中线对齐。
    expect(h.store.get('num')!.y).toBe(-5.5);
  });

  it('标题本来就在右边时不动它的水平位置', async () => {
    const h = slotsBackend([
      n('k', '簇', 'COMPONENT', ['g'], { w: 916, h: 400 }),
      n('g', 'Group', 'GROUP', ['title', 'num', 'b1'], { w: 916, h: 400 }),
      n('title', '#Title_Main', 'TEXT', [], { text: '簇标题', w: 180, h: 52, x: 120, y: 0 }),
      n('num', 'Number', 'INSTANCE', [], { w: 63, h: 63, x: 0, y: 0 }),
      n('b1', '正文/规则', 'TEXT', [], { text: '正文占位', w: 872, h: 129 })
    ]);
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'none', figure: 'none' }
    });
    expect(h.store.get('title')!.x).toBe(120);
    expect(h.store.get('num')!.x).toBe(0);
  });
});

/**
 * 蛋仔顶部每行是 `UI[标签, / 人名]`。值清掉之后只剩孤立标签「策划」「UX」，
 * 文档说明块只剩一个空框（411 高的灰带）。
 */
function top() {
  return [
    n('top', '顶部', 'COMPONENT', ['row1', 'row2', 'intro'], { w: 2205, h: 1726 }),
    n('row1', 'UI', 'FRAME', ['lb1', 'v1'], { w: 231, h: 70 }),
    n('lb1', '策划', 'TEXT', [], { text: '策划', w: 96, h: 70 }),
    n('v1', 'Text', 'TEXT', [], { text: '/辉湟', w: 115, h: 70 }),
    n('row2', 'UI', 'FRAME', ['lb2', 'owner'], { w: 479, h: 70 }),
    n('lb2', '审核者', 'TEXT', [], { text: '审核者', w: 144, h: 70 }),
    n('owner', '设计师名称', 'TEXT', [], { text: '/ 邵腾', w: 126, h: 70 }),
    n('intro', '文档说明', 'FRAME', ['i1'], { w: 2204, h: 591 }),
    n('i1', 'Text', 'TEXT', [], { text: '旧链接', w: 200, h: 40 })
  ];
}

describe('slimParts · 顶部残留', () => {
  it('值清空后写占位符，标签与分组都保留', async () => {
    const h = slotsBackend(top());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 'top' }],
      capabilities: { overview: 'none', figure: 'none' }
    });

    expect(h.writes).toContain('text:v1:/待补充');
    expect(h.writes).not.toContain('visible:row1:false');
    expect(h.writes).not.toContain('visible:row2:false');
    expect(h.childrenOf('row2').map((x) => x.name)).toEqual(['审核者', '设计师名称']);
  });

  it('顶部标签行居中时避让同行右侧的块', async () => {
    const h = slotsBackend([
      n('t', '顶部', 'COMPONENT', ['label', 'row', 'right'], { w: 2205, h: 700 }),
      n('label', '职能注意', 'TEXT', [], { text: '职能注意', w: 176, h: 71, x: 7, y: 0 }),
      n('row', '标签行', 'FRAME', ['a', 'b'], { w: 1000, h: 68, x: 205, y: 0 }),
      n('a', '标签', 'INSTANCE', [], { w: 199, h: 68, x: 0, y: 0 }),
      n('b', '标签', 'INSTANCE', [], { w: 199, h: 68, x: 199, y: 0 }),
      n('right', 'UI', 'FRAME', [], { w: 279, h: 70, x: 1600, y: 0 })
    ]);
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 't' }],
      capabilities: { overview: 'none', figure: 'none' }
    });

    // 整行 7..1205（1198 宽），可用宽度只到 1600：(1600-1198)/2 = 201
    expect(h.store.get('label')!.x).toBe(201);
    expect(h.store.get('row')!.x).toBe(399);
  });

  it('文档说明块保持可见，块里的区块标题不被当成残留清掉', async () => {
    const h = slotsBackend(top());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 'top' }],
      capabilities: { overview: 'none', figure: 'none' }
    });
    expect(h.writes).not.toContain('visible:intro:false');
    // `i1` 是普通文字（不是 /人 名、不是链接），保留；值型文本才换占位符。
    expect(h.store.get('i1')!.characters).toBe('旧链接');
  });

  it('文档说明里带着槽位时不隐藏', async () => {
    const nodes = top();
    nodes.find((x) => x.id === 'intro')!.childIds = ['i1', 'i2'];
    nodes.push(n('i2', '易协作单号链接', 'TEXT', [], { text: '#123', w: 300, h: 40 }));
    const h = slotsBackend(nodes);
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 'top' }],
      capabilities: { overview: 'none', figure: 'none' }
    });
    expect(h.writes).not.toContain('visible:intro:false');
  });
});
