/**
 * 蛋仔形状矩阵 —— 真机每一处返工，都在这里有一条断言。
 *
 * 这些形状（顶部三块、标签行靠左、文档说明双标题、簇内嵌套正文、裸矩形配图、
 * 编号实例、职能句尾）以前只活在对话与真机里，改代码时没有任何测试兜着，
 * 于是「修好一处弄坏另一处」反复发生。
 *
 * Spec: openspec changes「把蛋仔形状写进 fixture 矩阵」
 */

import { describe, it, expect } from 'vitest';
import { normalizeSlotNames } from '../../src/v2/compile/normalize-slots.js';
import { slimParts } from '../../src/v2/compile/slim-parts.js';
import { parseV2 } from '../../src/v2/parser.js';
import { TOP_SLOTS } from '../../src/v2/template-slots.js';
import { slotsBackend } from './helpers/slots-backend.js';
import { DANZI_MARKDOWN, danziCluster, danziTop } from './fixtures/danzi-shapes.js';

describe('蛋仔形状 · 顶部', () => {
  it('大标题、需求链接、两个区块标题各归各位', async () => {
    const h = slotsBackend(danziTop());
    const r = await normalizeSlotNames({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 'top' }]
    });
    const byId = new Map(r.renamed.map((x) => [x.nodeId, x.to]));

    // 标题行里那条大标题才是文档标题；文档说明里的长单号是需求链接。
    expect(byId.get('docTitle')).toBe(TOP_SLOTS.docTitle);
    expect(byId.get('ticket')).toBe(TOP_SLOTS.ticketLink);
    expect(byId.get('updated')).toBe(TOP_SLOTS.lastUpdate);
  });

  it('标签行居中时避让右侧的「策划 / UX / 审核者」', async () => {
    const h = slotsBackend(danziTop());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 'top' }],
      capabilities: { overview: 'none', figure: 'none' }
    });

    const label = h.store.get('roleNote')!;
    const row = h.store.get('tagRow')!;
    const right = h.store.get('sideAuditor')!;
    // 整行落在左侧块与右上块之间，且没有压上去
    expect(label.x!).toBeGreaterThan(0);
    expect(row.x! + row.absoluteBoundingBox!.width).toBeLessThan(right.x!);
    // 左右留白相等（可用宽度 = 到右侧块左边缘）
    expect(label.x!).toBeCloseTo(right.x! - (row.x! + row.absoluteBoundingBox!.width), 0);
  });

  it('文档说明的区块标题不会被当成残留清掉', async () => {
    const h = slotsBackend(danziTop());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'top', nodeId: 'top' }],
      capabilities: { overview: 'none', figure: 'none' }
    });
    expect(h.store.get('introHeading')!.characters).toBe('文档说明');
    expect(h.store.get('sectionHeading')!.characters).toBe('界面说明');
  });
});

describe('蛋仔形状 · 簇', () => {
  it('3 张大截图 + 1 张小图收成 1 个配图槽，正文只留一条', async () => {
    const h = slotsBackend(danziCluster());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'none', figure: 'named-group' }
    });

    const body = h.childrenOf('body');
    const names = body.map((x) => x.name);
    expect(names.filter((x) => x === '正文/规则')).toHaveLength(1);
    // 只留一个媒体载体，而且它被换成同尺寸虚线占位（名字统一成「配图」）。
    expect(body).toHaveLength(2);
    expect(h.writes.filter((w) => w.endsWith(':配图'))).toHaveLength(1);
    // 原稿的截图与小图不该再被留下
    expect(names.some((x) => x.startsWith('image '))).toBe(false);
  });

  it('编号与标题：标题让位、整组靠左、两者中线对齐', async () => {
    const h = slotsBackend(danziCluster());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'none', figure: 'none' }
    });

    const title = h.store.get('title')!;
    const num = h.store.get('num')!;
    // 靠左：编号仍在 0，标题在编号右侧（不居中）
    expect(num.x).toBe(0);
    expect(title.x!).toBeGreaterThanOrEqual(63);
    // 中线对齐
    const titleMid = title.y! + title.absoluteBoundingBox!.height / 2;
    const numMid = num.y! + num.absoluteBoundingBox!.height / 2;
    expect(Math.abs(titleMid - numMid)).toBeLessThan(1);
  });
});

describe('蛋仔形状 · Markdown 契约', () => {
  it('无总览 + 职能句尾的写法能通过校验（模板能力放宽）', () => {
    const r = parseV2(DANZI_MARKDOWN, { overviewOptional: true, roleLineOptional: true });
    expect(r.ok).toBe(true);
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    expect(cluster.bullets[0]).toContain('@GUI');
    expect(cluster.bullets.some((b) => b.startsWith('配图：'))).toBe(true);
  });

  it('同一份 Markdown 在官方形状下属硬错误（说明放宽是按模板来的）', () => {
    const r = parseV2(DANZI_MARKDOWN);
    expect(r.ok).toBe(false);
  });
});
