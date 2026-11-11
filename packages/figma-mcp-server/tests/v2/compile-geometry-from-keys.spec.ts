/**
 * 「库已发布 → 只生成 pack」这条路要能采到章节外框与标号网格。
 *
 * 背景（2026-11-05 复盘）：`captureGeometryFromKeys` 原先只传 `chapterKey`，
 * verify 出来的包永远缺 `sectionShell` / `bubbleGrid`，且不吭声。别的团队
 * 「我们已经有组件库了」时就拿到一份残包。
 *
 * Spec: openspec/changes/sop-sharing-readiness (D3)
 */

import { describe, it, expect } from 'vitest';
import type { FigmaBackend, NodeInfo } from '../../src/v2/figma-client.js';
import { captureGeometryFromKeys } from '../../src/v2/compile/geometry.js';

const BOX_IMAGE = { x: 0, y: 0, width: 1200, height: 719 };

/** 库文件：只有章节实例与主图。 */
function libBackend(trace: { deleted: string[] }): FigmaBackend {
  const nodes = new Map<string, NodeInfo>([
    [
      'lib:inst',
      {
        id: 'lib:inst',
        name: '__geometry_probe__',
        type: 'FRAME',
        parentId: 'lib:page',
        absoluteBoundingBox: { x: 0, y: 0, width: 2209, height: 1200 },
        childIds: ['lib:main']
      }
    ],
    [
      'lib:main',
      {
        id: 'lib:main',
        name: '主图占位',
        type: 'RECTANGLE',
        parentId: 'lib:inst',
        absoluteBoundingBox: BOX_IMAGE
      }
    ]
  ]);

  return {
    getNodeInfo: async (id: string) => nodes.get(id)!,
    scanSubtree: async (rootId: string) => {
      const out: NodeInfo[] = [];
      const queue = [rootId];
      while (queue.length > 0) {
        const id = queue.shift()!;
        const node = nodes.get(id);
        if (!node) continue;
        out.push(node);
        queue.push(...(node.childIds ?? []));
      }
      return { nodes: out, truncated: false };
    },
    instantiateByKey: async () => nodes.get('lib:inst')!,
    deleteNodes: async (ids: string[]) => {
      trace.deleted.push(...ids);
    },
    readPaints: async (ids: string[]) =>
      ids.map((nodeId) =>
        nodeId === 'lib:main'
          ? { nodeId, fill: '#2A2A2A', stroke: '#4A4A4A' }
          : { nodeId }
      )
  } as unknown as FigmaBackend;
}

/** 源模板文件：章节外面两层框、图上气泡带 3 个标号。 */
function sourceBackend(): FigmaBackend {
  const nodes = new Map<string, NodeInfo>([
    [
      'src:root',
      {
        id: 'src:root',
        name: '画布',
        type: 'FRAME',
        parentType: 'PAGE',
        childIds: ['src:section']
      }
    ],
    [
      'src:section',
      {
        id: 'src:section',
        name: '需求目标',
        type: 'FRAME',
        parentId: 'src:root',
        parentType: 'FRAME',
        padding: { top: 64, right: 64, bottom: 64, left: 64 },
        childIds: ['src:chapter']
      }
    ],
    [
      'src:chapter',
      {
        id: 'src:chapter',
        name: 'Group 2360',
        type: 'GROUP',
        parentId: 'src:section',
        parentType: 'FRAME',
        childIds: ['src:bubble', 'src:main']
      }
    ],
    [
      'src:main',
      {
        id: 'src:main',
        name: '主图占位',
        type: 'RECTANGLE',
        parentId: 'src:chapter',
        parentType: 'GROUP',
        absoluteBoundingBox: BOX_IMAGE
      }
    ],
    [
      'src:bubble',
      {
        id: 'src:bubble',
        name: '气泡',
        type: 'FRAME',
        parentId: 'src:chapter',
        parentType: 'GROUP',
        childIds: ['src:badge1', 'src:badge2', 'src:master']
      }
    ],
    [
      'src:badge1',
      {
        id: 'src:badge1',
        name: '标号/1',
        type: 'FRAME',
        parentId: 'src:bubble',
        parentType: 'FRAME',
        absoluteBoundingBox: { x: 60, y: 120, width: 48, height: 48 }
      }
    ],
    [
      'src:badge2',
      {
        id: 'src:badge2',
        name: '标号/2',
        type: 'FRAME',
        parentId: 'src:bubble',
        parentType: 'FRAME',
        absoluteBoundingBox: { x: 600, y: 360, width: 48, height: 48 }
      }
    ],
    [
      'src:master',
      {
        id: 'src:master',
        name: '标号/母版',
        type: 'FRAME',
        parentId: 'src:bubble',
        parentType: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 48, height: 48 }
      }
    ]
  ]);

  const collect = (rootId: string): NodeInfo[] => {
    const out: NodeInfo[] = [];
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = nodes.get(id);
      if (!node) continue;
      out.push(node);
      queue.push(...(node.childIds ?? []));
    }
    return out;
  };

  return {
    getNodeInfo: async (id: string) => nodes.get(id)!,
    scanSubtree: async (rootId: string) => ({ nodes: collect(rootId), truncated: false }),
    readPaints: async (ids: string[]) =>
      ids.map((nodeId) =>
        nodeId === 'src:root'
          ? { nodeId, fill: '#232429' }
          : nodeId === 'src:section'
            ? { nodeId, fill: '#161616' }
            : { nodeId }
      )
  } as unknown as FigmaBackend;
}

describe('verify 阶段从 key 采几何', () => {
  it('给了原稿 id 就能采到章节外框、标号网格与占位色', async () => {
    const trace = { deleted: [] as string[] };
    const { geometry, gaps } = await captureGeometryFromKeys({
      libraryBackend: libBackend(trace),
      sourceBackend: sourceBackend(),
      chapterKey: 'k-chapter',
      sourceRootId: 'src:root',
      sectionSourceId: 'src:chapter',
      badgeSourceId: 'src:bubble'
    });

    expect(geometry.docBackground).toBe('#232429');
    expect(geometry.chapterWidth).toBe(2209);
    expect(geometry.mainImage).toEqual({ width: 1200, height: 719 });
    expect(geometry.placeholder).toEqual({ fill: '#2A2A2A', stroke: '#4A4A4A' });
    expect(geometry.sectionShell).toEqual([
      { padding: { top: 64, right: 64, bottom: 64, left: 64 }, fill: '#161616' }
    ]);
    expect(geometry.bubbleGrid).toEqual([
      { x: 0.05, y: 0.1669 },
      { x: 0.5, y: 0.5007 }
    ]);
    expect(geometry.badgeSize).toEqual({ width: 48, height: 48 });
    // 临时实例量完就删，库里不留垃圾
    expect(trace.deleted).toEqual(['lib:inst']);
    // 两条「缺原稿 id」的话术都不该出现
    expect(gaps.map((g) => g.what).join(' ')).not.toContain('缺原稿');
  });

  it('原稿节点只在源文件里读——libraryBackend 上没有它们', async () => {
    // 若实现误用 libraryBackend，`scanSubtree('src:bubble')` 会拿到空数组，
    // bubbleGrid 就采不到；这里用「源文件才有节点」反过来验一遍。
    const trace = { deleted: [] as string[] };
    const { geometry } = await captureGeometryFromKeys({
      libraryBackend: libBackend(trace),
      sourceBackend: sourceBackend(),
      chapterKey: 'k-chapter',
      sectionSourceId: 'src:chapter',
      badgeSourceId: 'src:bubble'
    });
    expect(geometry.bubbleGrid).toHaveLength(2);
    expect(geometry.sectionShell).toHaveLength(1);
  });

  it('没给原稿 id 时 gaps 点名缺哪个、后果是什么', async () => {
    const trace = { deleted: [] as string[] };
    const { geometry, gaps } = await captureGeometryFromKeys({
      libraryBackend: libBackend(trace),
      sourceBackend: sourceBackend(),
      chapterKey: 'k-chapter'
    });

    expect(geometry.sectionShell).toBeUndefined();
    expect(geometry.bubbleGrid).toBeUndefined();

    const text = gaps.map((g) => `${g.what}｜${g.impact}｜${g.fix}`).join('\n');
    expect(text).toContain('缺原稿章节 id');
    expect(text).toContain('sectionShell');
    expect(text).toContain('缺原稿标号 id');
    expect(text).toContain('bubbleGrid');
  });
});
