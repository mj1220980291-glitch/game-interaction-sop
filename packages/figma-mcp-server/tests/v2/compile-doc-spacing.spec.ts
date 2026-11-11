/**
 * 文档级留白采集：`docPadding` / `rootGap` / `footerGap`。
 *
 * 背景（2026-11-11 蛋仔真机）：schema 早有这三个字段，compile 里却一行采集都没有，
 * 于是任何包这三项都为空、渲染按 0 处理 —— 内容贴边、块与块紧贴、结尾一刀切，
 * 只有肉眼能看出来。这里锁住采集口径与「量不到要吭声」。
 */

import { describe, it, expect } from 'vitest';
import type { FigmaBackend, NodeInfo } from '../../src/v2/figma-client.js';
import { captureDocSpacing } from '../../src/v2/compile/geometry.js';

type Spec = {
  id: string;
  parentId?: string;
  y?: number;
  h?: number;
  pad?: { top: number; right: number; bottom: number; left: number };
};

function backendOf(specs: Spec[]): FigmaBackend {
  const nodes: NodeInfo[] = specs.map((s) => ({
    id: s.id,
    name: s.id,
    type: 'FRAME',
    ...(s.parentId ? { parentId: s.parentId } : {}),
    ...(s.pad ? { padding: s.pad } : {}),
    absoluteBoundingBox: { x: 0, y: s.y ?? 0, width: 2205, height: s.h ?? 0 }
  }));
  return {
    scanSubtree: async () => ({ nodes, truncated: false })
  } as unknown as FigmaBackend;
}

describe('文档级留白采集', () => {
  it('把黑边画在文档根的模板（蛋仔型）', async () => {
    const backend = backendOf([
      { id: 'root', pad: { top: 0, right: 60, bottom: 0, left: 60 }, y: 0, h: 8972 },
      { id: 'top', parentId: 'root', y: 0, h: 814 },
      { id: 'title', parentId: 'root', y: 814, h: 321 },
      { id: 'spacer', parentId: 'root', y: 1228, h: 93 },
      { id: 'body', parentId: 'root', y: 1228, h: 7352 },
      { id: 'footGap', parentId: 'root', y: 8580, h: 200 },
      { id: 'end', parentId: 'root', y: 8780, h: 192 },
      // 章节装在 body 里，间距 60
      { id: 'c1', parentId: 'body', y: 1228, h: 591 },
      { id: 'c2', parentId: 'body', y: 1879, h: 75 },
      { id: 'c3', parentId: 'body', y: 2014, h: 1769 },
      { id: 'c4', parentId: 'body', y: 3843, h: 4737 }
    ]);

    const r = await captureDocSpacing({ backend, sourceRootId: 'root' });
    expect(r.docPadding).toEqual({ top: 0, right: 60, bottom: 0, left: 60 });
    expect(r.rootGap).toBe(60);
    expect(r.footerGap).toBe(200);
    expect(r.gaps).toHaveLength(0);
  });

  it('留白本来就是 0 的模板（1.14 型）不瞎填', async () => {
    const backend = backendOf([
      { id: 'root', y: 0, h: 5329 },
      { id: 'head', parentId: 'root', y: 0, h: 761 },
      { id: 'overview', parentId: 'root', y: 761, h: 995 },
      { id: 'body', parentId: 'root', y: 1756, h: 3573 },
      // 1.14 的块都是「有内容的框」，不是空留白块
      { id: 'overviewChild', parentId: 'overview', y: 761, h: 995 },
      { id: 'headChild', parentId: 'head', y: 0, h: 761 }
    ]);

    const r = await captureDocSpacing({ backend, sourceRootId: 'root' });
    expect(r.docPadding).toBeUndefined();
    expect(r.rootGap).toBeUndefined();
    expect(r.footerGap).toBeUndefined();
    expect(r.gaps).toHaveLength(0);
  });

  it('没有原稿根时点名缺什么、后果是什么', async () => {
    const r = await captureDocSpacing({ backend: backendOf([]) });
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]!.what).toContain('缺原稿文档根');
    expect(r.gaps[0]!.impact).toContain('贴边');
  });
});
