/**
 * 顶部：自由排版（蛋仔式）的槽位识别 + 原稿残留清空。
 *
 * Spec: openspec/changes/template-adaptive-shell（top 归一化）/ template-compile
 */

import { describe, it, expect } from 'vitest';
import { normalizeSlotNames } from '../../src/v2/compile/normalize-slots.js';
import { slimParts } from '../../src/v2/compile/slim-parts.js';
import { TOP_SLOTS } from '../../src/v2/template-slots.js';
import { n, slotsBackend } from './helpers/slots-backend.js';

/** 蛋仔顶部的真实形态：没有「标签：值」，标题/日期/UX 名字各自成块。 */
function danziTop() {
  return [
    n('t', '顶部', 'COMPONENT', ['date', 'title', 'roleNote', 'uxLabel', 'uxValue', 'auditor', 'status'], {
      w: 2205,
      h: 321
    }),
    n('date', '2025/07/02', 'TEXT', [], { text: '2025/07/02', w: 198, h: 52 }),
    n('title', '局内相关交互', 'TEXT', [], { text: '局内相关交互', w: 518, h: 125 }),
    n('roleNote', '职能注意', 'TEXT', [], { text: '职能注意', w: 176, h: 71 }),
    n('uxLabel', 'UX', 'TEXT', [], { text: 'UX', w: 60, h: 70 }),
    n('uxValue', '/ 苗儿', 'TEXT', [], { text: '/ 苗儿', w: 126, h: 70 }),
    n('auditor', '审核者', 'TEXT', [], { text: '审核者', w: 144, h: 70 }),
    n('status', '-未开始', 'TEXT', [], { text: '-未开始', w: 169, h: 70 })
  ];
}

describe('顶部自由排版归一化', () => {
  it('认出日期 / 标题 / 设计师，并把名字改成统一槽位', async () => {
    const h = slotsBackend(danziTop());
    const r = await normalizeSlotNames({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 't' }]
    });

    const byId = new Map(r.renamed.map((x) => [x.nodeId, x.to]));
    expect(byId.get('date')).toBe(TOP_SLOTS.lastUpdate);
    expect(byId.get('title')).toBe(TOP_SLOTS.docTitle);
    expect(byId.get('uxValue')).toBe(TOP_SLOTS.owner);
  });

  it('需求组 / 单号认不出来时记缺口', async () => {
    const h = slotsBackend(danziTop());
    const r = await normalizeSlotNames({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 't' }]
    });

    const whats = r.gaps.map((g) => g.what).join(' | ');
    expect(whats).toContain(TOP_SLOTS.group);
    expect(whats).toContain(TOP_SLOTS.ticketLink);
  });

  it('文档说明里的长单号不会被认成文档标题', async () => {
    const h = slotsBackend([
      n('t', '顶部', 'COMPONENT', ['row', 'intro'], { w: 2205, h: 1726 }),
      n('row', '标题行', 'GROUP', ['title'], { w: 2205, h: 321 }),
      n('title', '局内相关交互', 'TEXT', [], { text: '局内相关交互', w: 518, h: 125 }),
      n('intro', '文档说明', 'FRAME', ['long'], { w: 2204, h: 591 }),
      n('long', 'issue', 'TEXT', [], {
        text: 'UI设计 #367218 【OGC2组】搜打撤局内界面 https://u5.pm.netease.com/v6/issues/367218',
        w: 2007,
        h: 65
      })
    ]);
    const r = await normalizeSlotNames({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 't' }]
    });

    const byId = new Map(r.renamed.map((x) => [x.nodeId, x.to]));
    expect(byId.get('title')).toBe(TOP_SLOTS.docTitle);
    expect(byId.get('long')).toBeUndefined();
  });

  it('已是统一名的不再改（1:14 幂等）', async () => {
    const h = slotsBackend([
      n('t2', '顶部', 'COMPONENT', ['a', 'b'], { w: 3690, h: 761 }),
      n('a', TOP_SLOTS.docTitle, 'TEXT', [], { text: '旧标题', w: 400, h: 100 }),
      n('b', TOP_SLOTS.lastUpdate, 'TEXT', [], { text: '2025.01.01', w: 200, h: 50 })
    ]);
    const r = await normalizeSlotNames({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 't2' }]
    });

    expect(r.renamed.filter((x) => x.nodeId === 'a' || x.nodeId === 'b')).toEqual([]);
  });
});

describe('实例子层保护', () => {
  it('实例子层不改名（getNodeByIdAsync 会卡死），只改实例本身', async () => {
    const h = slotsBackend([
      n('k', 'Group 1253', 'GROUP', ['num', 'title', 'b1'], { w: 900, h: 800 }),
      n('num', 'Number', 'INSTANCE', ['numText'], { w: 44, h: 40 }),
      n('numText', '1', 'TEXT', [], { text: '1', w: 20, h: 34 }),
      n('title', '#Title_Main', 'TEXT', [], { text: '标题', w: 200, h: 40 }),
      n('b1', '正文/规则', 'TEXT', [], { text: '一条', w: 800, h: 44 })
    ]);

    const r = await normalizeSlotNames({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { figure: 'none', clusterGroups: 'none', overview: 'none' }
    });

    expect(h.renamed.find((x) => x.nodeId === 'numText')).toBeUndefined();
    // 载体本身已叫 `Number`（统一名），所以不产生改名动作——关键是没去碰内层。
    expect(h.renamed.every((x) => x.nodeId !== 'numText')).toBe(true);
    expect(r.gaps.every((g) => !g.what.includes('编号载体'))).toBe(true);
  });
});

describe('章节：气泡不能被当成主图', () => {
  it('舞台里的气泡 1920 比主图 1200 宽，也不能改名成主图占位', async () => {
    const h = slotsBackend([
      n('c', '章节', 'COMPONENT', ['left', 'col'], { w: 2209, h: 1769 }),
      n('left', '左列', 'FRAME', ['stage'], { w: 1200, h: 805 }),
      n('stage', '舞台', 'FRAME', ['img', 'bubble'], { w: 1200, h: 719 }),
      n('img', '主图占位', 'RECTANGLE', [], { w: 1200, h: 719 }),
      n('bubble', '气泡', 'FRAME', [], { w: 1920, h: 1080 }),
      n('col', 'Text', 'FRAME', [], { w: 932, h: 1769 })
    ]);

    const r = await normalizeSlotNames({
      backend: h.backend,
      parts: [{ part: 'chapter', nodeId: 'c' }],
      capabilities: { figure: 'none', clusterGroups: 'none', overview: 'none' }
    });

    expect(r.renamed.find((x) => x.nodeId === 'bubble')).toBeUndefined();
    expect(h.store.get('bubble')!.name).toBe('气泡');
  });

  it('舞台与主图同宽时也不会被改名（已有主图占位就别再认）', async () => {
    const h = slotsBackend([
      n('c', '章节', 'COMPONENT', ['left', 'col'], { w: 2209, h: 1769 }),
      n('left', '左列', 'FRAME', ['stage'], { w: 1200, h: 805 }),
      n('stage', '舞台', 'FRAME', ['img'], { w: 1200, h: 719 }),
      n('img', '主图占位', 'RECTANGLE', [], { w: 1200, h: 719 }),
      n('col', 'Text', 'FRAME', [], { w: 932, h: 1769 })
    ]);

    await normalizeSlotNames({
      backend: h.backend,
      parts: [{ part: 'chapter', nodeId: 'c' }],
      capabilities: { figure: 'none', clusterGroups: 'none', overview: 'none' }
    });

    expect(h.store.get('stage')!.name).toBe('舞台');
    expect(h.store.get('img')!.name).toBe('主图占位');
  });
});

describe('顶部落残留空壳化', () => {
  it('overview = none 时清空未归位的原稿文案，保留槽位文本', async () => {
    const h = slotsBackend(danziTop());
    // 真实链路里归一化先跑，标题已是统一槽位名。
    h.store.get('title')!.name = TOP_SLOTS.docTitle;
    (h.backend as unknown as { setMultipleTextContents: unknown }).setMultipleTextContents = async (
      updates: Array<{ nodeId: string; characters: string }>
    ) => {
      for (const u of updates) {
        const node = h.store.get(u.nodeId);
        if (node) node.characters = u.characters;
      }
      return { applied: updates.length, boldUnavailable: [] };
    };

    const r = await slimParts({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 't' }],
      capabilities: { overview: 'none' }
    });

    expect(r.cleared).toBeGreaterThan(0);
    // 标签要留着撑版式，值换成占位符（留空串会让人以为这一行漏了）；
    // 槽位文本也换成占位符，部件里不留上一份需求的内容。
    expect(h.store.get('roleNote')!.characters).toBe('职能注意');
    expect(h.store.get('status')!.characters).toBe('/待补充');
    expect(h.store.get('title')!.characters).toBe('文档标题');
  });

  it('有总览区时不动顶部（总览标题要留着）', async () => {
    const h = slotsBackend(danziTop());
    const r = await slimParts({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 't' }],
      capabilities: { overview: 'two-frames' }
    });

    expect(r.cleared).toBe(0);
    expect(h.store.get('roleNote')!.characters).toBe('职能注意');
  });
});
