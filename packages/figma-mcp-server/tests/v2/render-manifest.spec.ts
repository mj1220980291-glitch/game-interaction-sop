/**
 * E5 / E7 — 渲染返回体的对账清单。
 *
 * E5：M3 返回 `bubbleCount: 16`，两轮脚本后 03 章只剩 2 个标号，没人能对账。
 *     现在返回体带 `bubbles`（逐章：section / cluster / nodeId），并且摆放后
 *     引擎会重新数一遍容器（不符就报 V2_W_BADGE_COUNT_MISMATCH）。
 * E7：簇配图的 `"NN/C/K"` 要求人工数顺序。现在支持 `"NN/C/<配图描述>"`（byTitle），
 *     并输出 `figureSlots` 清单（path / 描述 / 节点 id）作为映射底表。
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { makeBackend, collectByName } from './helpers/mock-backend.js';

const HEAD = `# 清单

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.11.03

## 设计总览

### 功能背景

背景。

### 核心交互

交互。
`;

const BODY = `## 01. 战斗界面

### 血条
@GUI

- a
- 配图：低血量示意

### 击杀提示
@GUI

- b
- 配图：击杀飘字
`;

const MD = `${HEAD}\n${BODY}`;

const sourceNode = (nodeId: string) => ({ type: 'figma_node' as const, fileKey: 'f', nodeId });

describe('E5 逐章气泡清单', () => {
  it('返回体带 bubbles：每个簇一条，章节与序号可对账', async () => {
    const m = makeBackend();
    const r = await renderV2MarkdownToFigma({ markdown: MD }, m.backend);

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.bubbles).toHaveLength(2);
    expect(r.bubbles?.map((b) => [b.section, b.cluster])).toEqual([
      ['01', 1],
      ['01', 2]
    ]);
    for (const bubble of r.bubbles ?? []) {
      expect(m.store[bubble.nodeId]?.name).toMatch(/^Number$|标号/);
    }
  });

  it('气泡清单与 summary.bubbleCount 一致', async () => {
    const m = makeBackend();
    const r = await renderV2MarkdownToFigma({ markdown: MD }, m.backend);
    expect(r.summary?.bubbleCount).toBe(r.bubbles?.length);
  });
});

describe('E7 配图槽清单与 byTitle 键', () => {
  it('figureSlots 列出全部槽位（path / 描述）', async () => {
    const m = makeBackend();
    const r = await renderV2MarkdownToFigma({ markdown: MD }, m.backend);
    expect(r.figureSlots?.map((s) => s.path)).toEqual(['01/1/1', '01/2/1']);
    expect(r.figureSlots?.map((s) => s.title)).toEqual(['低血量示意', '击杀飘字']);
  });

  it('"NN/C/<配图描述>" 键按描述落到对应槽，不用数顺序', async () => {
    const m = makeBackend();
    m.addSource('S', 400, 200);

    const r = await renderV2MarkdownToFigma(
      { markdown: MD, assetMap: { '01/2/击杀飘字': sourceNode('S') } },
      m.backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.summary?.figuresPlaced).toBe(1);
    // 只有「击杀飘字」那个槽被填，另一个仍是灰板。
    const placeholders = collectByName(m.store, r.rootInstanceId!, '配图占位');
    const filled = placeholders.filter(
      (n) => typeof (n as { fill?: string }).fill === 'string'
    );
    expect(placeholders).toHaveLength(2);
    expect(filled).toHaveLength(1);
    expect((filled[0] as { fill?: string }).fill).toBe('IMAGE:S');
  });

  it('描述键写错时报 V2_W_ASSET_KEY_UNMATCHED（而不是静默丢图）', async () => {
    const m = makeBackend();
    m.addSource('S', 400, 200);

    const r = await renderV2MarkdownToFigma(
      { markdown: MD, assetMap: { '01/2/不存在的图': sourceNode('S') } },
      m.backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings.some((w) => w.code === 'V2_W_ASSET_KEY_UNMATCHED')).toBe(true);
  });
});
