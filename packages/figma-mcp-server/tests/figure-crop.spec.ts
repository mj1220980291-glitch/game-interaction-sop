/**
 * fillFigurePlaceholder / rasterizeNodeToImageFill — 插件端裁剪与尺寸。
 *
 * 捕获 backend 发给 figma_execute 的脚本，在模拟 `figma` 全局下执行。
 *
 * Change: openspec/changes/engine-figure-asset-crop-fit
 */

import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { buildFigmaConsoleBackend } from '../src/server/figmaConsoleBackend.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>;

interface FakeNode {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  fills: unknown[];
  removed: boolean;
  children: FakeNode[];
  clipsContent?: boolean;
  layoutSizingHorizontal?: string;
  clone(): FakeNode;
  remove(): void;
  resize(w: number, h: number): void;
  appendChild(c: FakeNode): void;
  exportAsync(opts: unknown): Promise<Uint8Array>;
}

function harness(opts: { failExport?: boolean } = {}) {
  const exports: Array<{ nodeName: string; width: number; height: number; childOffset?: [number, number]; clips?: boolean }> = [];
  const created: FakeNode[] = [];
  let seq = 0;

  const make = (id: string, name: string, w: number, h: number): FakeNode => {
    const n: FakeNode = {
      id,
      name,
      width: w,
      height: h,
      x: 0,
      y: 0,
      fills: [{ type: 'SOLID' }],
      removed: false,
      children: [],
      clone() {
        return make(`clone-${seq++}`, `${name} copy`, w, h);
      },
      remove() {
        n.removed = true;
      },
      resize(nw, nh) {
        n.width = nw;
        n.height = nh;
      },
      appendChild(c) {
        n.children.push(c);
      },
      async exportAsync() {
        if (opts.failExport) throw new Error('export boom');
        const child = n.children[0];
        exports.push({
          nodeName: n.name,
          width: n.width,
          height: n.height,
          childOffset: child ? [child.x, child.y] : undefined,
          clips: n.clipsContent
        });
        return new Uint8Array([1]);
      }
    };
    return n;
  };

  const nodes = new Map<string, FakeNode>();
  const add = (n: FakeNode) => (nodes.set(n.id, n), n);
  add(make('src', '设计稿', 1920, 1080));
  add(make('strip', '滚动条', 50, 636));
  const group = add(make('grp', '配图', 1231, 237));
  group.layoutSizingHorizontal = 'FILL';
  const rect = add(make('rect', '配图占位', 1231, 237));
  const hint = add(make('hint', '配图占位文案', 620, 64));
  const main = add(make('main', '主图占位', 1920, 1080));

  const figma = {
    getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
    createFrame: () => {
      const f = make(`frame-${seq++}`, 'frame', 100, 100);
      created.push(f);
      return f;
    },
    createImage: () => ({ hash: 'H' })
  };

  const client = {
    callTool: async ({ arguments: args }: { arguments: { code: string } }) => {
      try {
        const result = await new AsyncFunction('figma', args.code)(figma);
        return { content: [{ type: 'text', text: JSON.stringify({ _mcp: 'fake', success: true, result }) }] };
      } catch (e) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ _mcp: 'fake', success: false, error: (e as Error).message }) }]
        };
      }
    }
  } as unknown as Client;

  return { backend: buildFigmaConsoleBackend(client), exports, created, group, rect, hint, main };
}

describe('fillFigurePlaceholder', () => {
  it('裁剪走临时 clip FRAME，按区域比例缩到 maxWidth，删除文案', async () => {
    const h = harness();
    const r = await h.backend.fillFigurePlaceholder!({
      sourceNodeId: 'src',
      groupId: 'grp',
      rectId: 'rect',
      hintId: 'hint',
      crop: { x: 0, y: 0, width: 1920, height: 1080 },
      maxWidth: 1231
    });

    expect(r).toEqual({ width: 1231, height: 692 });
    expect([h.rect.width, h.rect.height]).toEqual([1231, 692]);
    expect(h.rect.fills).toEqual([{ type: 'IMAGE', scaleMode: 'FILL', imageHash: 'H' }]);
    expect(h.group.layoutSizingHorizontal).toBe('FIXED');
    expect(h.hint.removed).toBe(true);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]!.removed).toBe(true);
  });

  it('裁剪偏移为 (-x, -y)，临时 FRAME 尺寸 = 区域尺寸且裁切内容', async () => {
    const h = harness();
    await h.backend.fillFigurePlaceholder!({
      sourceNodeId: 'src',
      groupId: 'grp',
      rectId: 'rect',
      crop: { x: 1724, y: 888, width: 169, height: 169 },
      maxWidth: 1231
    });

    expect(h.exports).toEqual([
      { nodeName: '__crop_tmp__', width: 169, height: 169, childOffset: [-1724, -888], clips: true }
    ]);
    expect([h.rect.width, h.rect.height]).toEqual([169, 169]);
  });

  it('无 crop 时直接导出源节点；小图不放大', async () => {
    const h = harness();
    const r = await h.backend.fillFigurePlaceholder!({
      sourceNodeId: 'strip',
      groupId: 'grp',
      rectId: 'rect',
      maxWidth: 1231
    });

    expect(r).toEqual({ width: 50, height: 636 });
    expect(h.exports[0]!.nodeName).toBe('滚动条');
    expect(h.created).toHaveLength(0);
    expect(h.hint.removed).toBe(false);
  });

  it('导出失败时临时 FRAME 仍被删除，错误向上抛', async () => {
    const h = harness({ failExport: true });
    await expect(
      h.backend.fillFigurePlaceholder!({
        sourceNodeId: 'src',
        groupId: 'grp',
        rectId: 'rect',
        crop: { x: 0, y: 0, width: 10, height: 10 },
        maxWidth: 1231
      })
    ).rejects.toThrow(/export boom/);
    expect(h.created[0]!.removed).toBe(true);
    expect(h.rect.fills).toEqual([{ type: 'SOLID' }]);
  });

  it('源节点不存在时错误信息带 nodeId', async () => {
    const h = harness();
    await expect(
      h.backend.fillFigurePlaceholder!({
        sourceNodeId: '999:1',
        groupId: 'grp',
        rectId: 'rect',
        maxWidth: 1231
      })
    ).rejects.toThrow(/999:1/);
  });
});

describe('rasterizeNodeToImageFill + crop', () => {
  it('主图带 crop 时裁剪导出，但不改主图占位尺寸', async () => {
    const h = harness();
    await h.backend.rasterizeNodeToImageFill!({
      sourceNodeId: 'src',
      targetNodeId: 'main',
      crop: { x: 100, y: 50, width: 800, height: 450 }
    });

    expect(h.exports[0]).toMatchObject({ width: 800, height: 450, childOffset: [-100, -50] });
    expect([h.main.width, h.main.height]).toEqual([1920, 1080]);
    expect(h.main.fills).toEqual([{ type: 'IMAGE', scaleMode: 'FILL', imageHash: 'H' }]);
  });
});
