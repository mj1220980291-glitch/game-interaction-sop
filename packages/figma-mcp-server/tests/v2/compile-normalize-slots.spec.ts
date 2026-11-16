/**
 * 编译期槽位命名归一化。
 *
 * 覆盖三件事：
 *   1. 项目原名（`Group 2360` / `Frame 1245`）能被改成统一名
 *   2. 已是统一名的部件零改动（幂等）
 *   3. 关键槽位缺失时拒绝，而不是带着半套部件去发布
 *
 * Spec: template-compile「槽位命名归一化」
 */

import { describe, it, expect } from 'vitest';
import { normalizeSlotNames } from '../../src/v2/compile/normalize-slots.js';
import { COMPILE_CODES } from '../../src/v2/compile/errors.js';
import { CHAPTER_SLOTS, CLUSTER_SLOTS, TOP_SLOTS } from '../../src/v2/template-slots.js';
import { n, slotsBackend } from './helpers/slots-backend.js';

function chapterFixture() {
  return [
    n('c', 'Group 2360', 'GROUP', ['g', 'col', 'box'], { w: 2209, h: 6240 }),
    n('g', 'Group 2358', 'GROUP', ['img', 'num1'], { w: 1200, h: 745 }),
    n('img', 'bg_five_recharge 1', 'RECTANGLE', [], { w: 1200, h: 745 }),
    n('num1', 'num', 'INSTANCE', ['num1t'], { w: 44, h: 40 }),
    n('num1t', '1', 'TEXT', [], { text: '1', w: 20, h: 34 }),
    n('col', 'Frame 1243', 'FRAME', ['cl1'], { w: 932, h: 600 }),
    n('cl1', 'Frame 1245', 'FRAME', ['cl1t', 'cl1b'], { w: 900, h: 500 }),
    n('cl1t', '金币提示', 'TEXT', [], { text: '金币提示', w: 300, h: 44 }),
    n('cl1b', 'Frame 808', 'FRAME', ['cl1l1'], { w: 900, h: 400 }),
    n('cl1l1', '很长的说明文字，解释规则', 'TEXT', [], { text: '很长的说明文字，解释规则', w: 860, h: 44 }),
    n('box', '标题', 'FRAME', ['boxT'], { w: 285, h: 75 }),
    n('boxT', '界面名称', 'TEXT', [], { text: '角色系统', w: 232, h: 62 })
  ];
}

function clusterFixture() {
  return [
    n('k', 'Group 1253', 'GROUP', ['kt', 'kn', 'kb'], { w: 900, h: 800 }),
    n('kt', '金币提示', 'TEXT', [], { text: '金币提示', w: 300, h: 44 }),
    n('kn', 'num', 'INSTANCE', ['knt'], { w: 44, h: 40 }),
    n('knt', '1', 'TEXT', [], { text: '1', w: 20, h: 34 }),
    n('kb', 'Frame 808', 'FRAME', ['kl1', 'kl2', 'kimg', 'kspare'], { w: 900, h: 800 }),
    n('kl1', '很长的说明文字，解释规则', 'TEXT', [], { text: '很长的说明文字，解释规则', w: 860, h: 44 }),
    n('kl2', '另一条规则说明文字', 'TEXT', [], { text: '另一条规则说明文字', w: 860, h: 44 }),
    n('kimg', 'image 37998', 'RECTANGLE', [], { w: 400, h: 240 }),
    n('kspare', '备用文案', 'TEXT', [], { text: '备用文案', w: 100, h: 40, visible: false })
  ];
}

describe('normalizeSlotNames', () => {
  it('把项目原名改成统一名（章节）', async () => {
    const { backend, renamed } = slotsBackend(chapterFixture());
    const r = await normalizeSlotNames({
      backend,
      parts: [{ part: 'chapter', nodeId: 'c' }],
      capabilities: { figure: 'first-non-text', clusterGroups: 'none', overview: 'none' }
    });
    const to = new Map(renamed.map((x) => [x.nodeId, x.name]));
    expect(to.get('col')).toBe(CHAPTER_SLOTS.clusterHost);
    expect(to.get('img')).toBe(CHAPTER_SLOTS.mainImage);
    expect(to.get('boxT')).toBe(CHAPTER_SLOTS.sectionTitle);
    expect(r.renamed.length).toBe(3);
  });

  it('把项目原名改成统一名（簇）', async () => {
    const { backend, renamed } = slotsBackend(clusterFixture());
    await normalizeSlotNames({
      backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { figure: 'first-non-text', clusterGroups: 'none', overview: 'none' }
    });
    const to = new Map(renamed.map((x) => [x.nodeId, x.name]));
    expect(to.get('kn')).toBe(CLUSTER_SLOTS.number);
    expect(to.get('kt')).toBe(CLUSTER_SLOTS.title);
    expect(to.get('kl1')).toBe(CLUSTER_SLOTS.bullet);
    expect(to.get('kl2')).toBe(CLUSTER_SLOTS.bullet);
    expect(to.get('kspare')).toBe(CLUSTER_SLOTS.bullet);
    expect(to.get('kimg')).toBe(CLUSTER_SLOTS.figure);
    expect(to.get('kimg')).not.toBe(CLUSTER_SLOTS.figureHint);
  });

  it('已是统一名的部件零改动（幂等）', async () => {
    const nodes = [
      ...chapterFixture(),
      ...clusterFixture()
    ];
    // 先把 fixture 直接改成统一名，模拟官方 1:14 风格的已归一化部件。
    const canonicalNames: Record<string, string> = {
      col: CHAPTER_SLOTS.clusterHost,
      img: CHAPTER_SLOTS.mainImage,
      boxT: CHAPTER_SLOTS.sectionTitle,
      kn: CLUSTER_SLOTS.number,
      knt: CLUSTER_SLOTS.number,
      kt: CLUSTER_SLOTS.title,
      kl1: CLUSTER_SLOTS.bullet,
      kl2: CLUSTER_SLOTS.bullet,
      kspare: CLUSTER_SLOTS.bullet,
      kimg: CLUSTER_SLOTS.figure
    };
    const patched = nodes.map((node) =>
      canonicalNames[node.id] ? { ...node, name: canonicalNames[node.id]! } : node
    );
    const { backend, renamed } = slotsBackend(patched);
    const r = await normalizeSlotNames({
      backend,
      parts: [
        { part: 'chapter', nodeId: 'c' },
        { part: 'cluster', nodeId: 'k' }
      ],
      capabilities: { figure: 'first-non-text', clusterGroups: 'none', overview: 'none' }
    });
    expect(r.renamed).toEqual([]);
    expect(renamed).toEqual([]);
  });

  it('有包装层时仍找对说明栏，不把标号容器当 Text', async () => {
    const nodes = [
      n('w', '章节', 'FRAME', ['wrap', 'bubble'], { w: 2209, h: 6240 }),
      n('wrap', 'Group 2363', 'GROUP', ['g2', 'col2'], { w: 2209, h: 6240 }),
      n('g2', '界面图示', 'GROUP', ['img2'], { w: 1200, h: 745 }),
      n('img2', 'bg', 'RECTANGLE', [], { w: 1200, h: 745 }),
      n('col2', 'Frame 1243', 'FRAME', ['cl2'], { w: 932, h: 6240 }),
      n('cl2', 'Frame 1245', 'FRAME', ['cl2t', 'cl2b'], { w: 900, h: 700 }),
      n('cl2t', '此处需要显示所有玩家的序号和姓名。', 'TEXT', [], {
        text: '此处需要显示所有玩家的序号和姓名。',
        w: 800,
        h: 44
      }),
      n('cl2b', '玩家自己需要黄色标注出来。', 'TEXT', [], {
        text: '玩家自己需要黄色标注出来。',
        w: 800,
        h: 44
      }),
      n('bubble', '气泡', 'FRAME', ['b1'], { w: 1920, h: 1080 }),
      n('b1', '标号/母版', 'FRAME', ['b1t'], { w: 48, h: 48 }),
      n('b1t', '#Number', 'TEXT', [], { text: '1', w: 40, h: 40 })
    ];
    const { backend, renamed } = slotsBackend(nodes);
    await normalizeSlotNames({
      backend,
      parts: [{ part: 'chapter', nodeId: 'w' }],
      capabilities: { figure: 'first-non-text', clusterGroups: 'none', overview: 'none' }
    });
    const to = new Map(renamed.map((x) => [x.nodeId, x.name]));
    expect(to.get('col2')).toBe(CHAPTER_SLOTS.clusterHost);
    expect(to.get('bubble')).toBeUndefined();
  });

  it('说明栏已被掏空时仍能认出它', async () => {
    const nodes = [
      n('e', '章节', 'FRAME', ['eg', 'ecol'], { w: 2209, h: 6240 }),
      n('eg', '界面图示', 'GROUP', ['eimg'], { w: 1200, h: 745 }),
      n('eimg', 'bg', 'RECTANGLE', [], { w: 1200, h: 745 }),
      n('ecol', 'Frame 1243', 'FRAME', [], { w: 932, h: 600 })
    ];
    const { backend, renamed } = slotsBackend(nodes);
    await normalizeSlotNames({
      backend,
      parts: [{ part: 'chapter', nodeId: 'e' }],
      capabilities: { figure: 'first-non-text', clusterGroups: 'none', overview: 'none' }
    });
    const to = new Map(renamed.map((x) => [x.nodeId, x.name]));
    expect(to.get('ecol')).toBe(CHAPTER_SLOTS.clusterHost);
  });

  it.each([
    { type: 'FRAME' as const, statusName: '状态说明', w: 1000, h: 3000 },
    { type: 'GROUP' as const, statusName: '状态说明', w: 6000, h: 80 },
    { type: 'FRAME' as const, statusName: 'Text', w: 6000, h: 3000 }
  ])('嵌套 $type Text 优先于状态 TEXT（$statusName，$w×$h）', async ({ type, statusName, w, h }) => {
    const nodes = [
      n('c', '章节', 'COMPONENT', ['title', 'status', 'sect'], { w: 4694, h: 2183 }),
      n('title', '标题', 'FRAME', ['titleText'], { w: 1000, h: 80 }),
      n('titleText', '#Name', 'TEXT', [], { text: '章节标题', w: 800, h: 60 }),
      n('status', statusName, 'TEXT', [], { text: '状态说明', w, h }),
      n('sect', 'sect', 'FRAME', ['stage', 'col'], { w: 4500, h: 2000 }),
      n('stage', '舞台', 'FRAME', ['img', 'bubble'], { w: 2400, h: 2000 }),
      n('img', '主图占位', 'RECTANGLE', [], { w: 2400, h: 1600 }),
      n('bubble', '气泡', 'FRAME', ['badge'], { w: 2400, h: 1600 }),
      n('badge', '标号/母版', 'FRAME', ['number'], { w: 48, h: 48, visible: false }),
      n('number', '#Number', 'TEXT', [], { text: '1', w: 40, h: 40 }),
      n('col', 'Text', type, [], { w: 1974, h: 1 })
    ];
    const { backend, renamed } = slotsBackend(nodes);
    const r = await normalizeSlotNames({ backend, parts: [{ part: 'chapter', nodeId: 'c' }] });
    expect(renamed).toEqual([]);
    expect(r.renamed).toEqual([]);
    expect(r.gaps).toEqual([]);
  });

  it('旧直接两列模板：唯一空右列不受更高更宽状态 TEXT 干扰', async () => {
    const nodes = [
      n('c', '章节', 'FRAME', ['title', 'status', 'stage', 'col'], { w: 4694, h: 2183 }),
      n('title', '#Name', 'TEXT', [], { text: '章节标题', w: 800, h: 60 }),
      n('status', '状态说明', 'TEXT', [], { text: '状态说明', w: 6000, h: 3000 }),
      n('stage', '舞台', 'FRAME', ['img'], { w: 2400, h: 2000 }),
      n('img', '主图占位', 'RECTANGLE', [], { w: 2400, h: 1600 }),
      n('col', '旧说明栏', 'FRAME', [], { w: 1974, h: 1 })
    ];
    const { backend, renamed } = slotsBackend(nodes);
    await normalizeSlotNames({ backend, parts: [{ part: 'chapter', nodeId: 'c' }] });
    expect(renamed).toEqual([{ nodeId: 'col', name: CHAPTER_SLOTS.clusterHost }]);
  });

  it('状态 TEXT 不是右列候选，即使它是图区外唯一节点', async () => {
    const nodes = [
      n('c', '章节', 'FRAME', ['stage', 'status'], { w: 4694, h: 2183 }),
      n('stage', '舞台', 'FRAME', ['img'], { w: 2400, h: 2000 }),
      n('img', '主图占位', 'RECTANGLE', [], { w: 2400, h: 1600 }),
      n('status', '状态说明', 'TEXT', [], { text: '状态说明', w: 6000, h: 3000 })
    ];
    const { backend, renamed } = slotsBackend(nodes);
    await expect(normalizeSlotNames({ backend, parts: [{ part: 'chapter', nodeId: 'c' }] }))
      .rejects.toMatchObject({ code: COMPILE_CODES.SLOT_UNMAPPED });
    expect(renamed.some((r) => r.nodeId === 'status' && r.name === CHAPTER_SLOTS.clusterHost)).toBe(false);
  });

  it('关键槽位缺失时拒绝', async () => {
    const nodes = [
      n('k2', 'Group 1253', 'GROUP', ['kn2', 'knt2'], { w: 900, h: 800 }),
      n('kn2', 'num', 'INSTANCE', ['knt2'], { w: 44, h: 40 }),
      n('knt2', '1', 'TEXT', [], { text: '1', w: 20, h: 34 })
    ];
    const { backend } = slotsBackend(nodes);
    await expect(
      normalizeSlotNames({
        backend,
        parts: [{ part: 'cluster', nodeId: 'k2' }],
        capabilities: { figure: 'first-non-text', clusterGroups: 'none', overview: 'none' }
      })
    ).rejects.toMatchObject({ code: COMPILE_CODES.SLOT_UNMAPPED });
  });

  it('只调用改名，不产生其他写操作', async () => {
    const { backend, writes } = slotsBackend(clusterFixture());
    await normalizeSlotNames({
      backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { figure: 'first-non-text', clusterGroups: 'none', overview: 'none' }
    });
    expect(writes.every((w) => w.startsWith('rename:'))).toBe(true);
  });

  it('顶部：总览两块 + 标签值对', async () => {
    const nodes = [
      n('t', '顶部', 'FRAME', ['ov', 'meta'], { w: 2200, h: 900 }),
      n('ov', '设计总览', 'FRAME', ['b1', 'b2'], { w: 1800, h: 400 }),
      n('b1', 'Frame 12', 'FRAME', ['b1h', 'b1c'], { w: 1200, h: 140 }),
      n('b1h', '1.功能背景', 'TEXT', [], { text: '1.功能背景', w: 200, h: 40 }),
      n('b1c', '说明文本', 'TEXT', [], { text: '玩家在局内需要快速查看当前状态。', w: 800, h: 90 }),
      n('b2', 'Frame 13', 'FRAME', ['b2h', 'b2c'], { w: 1200, h: 140 }),
      n('b2h', '2.核心交互', 'TEXT', [], { text: '2.核心交互', w: 200, h: 40 }),
      n('b2c', '说明文本 2', 'TEXT', [], { text: '点击入口打开面板，拖动切换页签。', w: 800, h: 90 }),
      n('meta', '元信息', 'FRAME', ['l1', 'v1'], { w: 600, h: 80 }),
      n('l1', '设计师', 'TEXT', [], { text: '设计师', w: 100, h: 40 }),
      n('v1', '苗儿', 'TEXT', [], { text: '苗儿', w: 100, h: 40 })
    ];
    const { backend, renamed } = slotsBackend(nodes);
    await normalizeSlotNames({
      backend,
      parts: [{ part: 'top', nodeId: 't' }],
      capabilities: { figure: 'none', clusterGroups: 'none', overview: 'two-frames' }
    });
    const to = new Map(renamed.map((x) => [x.nodeId, x.name]));
    expect(to.get('b1')).toBe(TOP_SLOTS.overviewBackground);
    expect(to.get('b2')).toBe(TOP_SLOTS.overviewCore);
    expect(to.get('b1c')).toBe('#Content');
    expect(to.get('v1')).toBe(TOP_SLOTS.owner);
  });
});
