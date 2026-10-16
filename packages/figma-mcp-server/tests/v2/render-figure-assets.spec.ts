/**
 * 配图资产按 `"NN/C/K"` 键填充，占位尺寸按图片比例。
 *
 * Change: openspec/changes/engine-figure-asset-crop-fit
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma, type AssetSpec } from '../../src/v2/render.js';
import { makeBackend, collectByName, type NodeStore } from './helpers/mock-backend.js';

const HEAD = `# 配图资产

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.10.16

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。
`;

function doc(body: string): string {
  return `${HEAD}\n${body}`.trim();
}

const node = (nodeId: string, extra: Partial<Extract<AssetSpec, { type: 'figma_node' }>> = {}): AssetSpec => ({
  type: 'figma_node',
  fileKey: 'f',
  nodeId,
  ...extra
});

function blocks(store: NodeStore, rootId: string) {
  const rightCol = collectByName(store, rootId, 'Text')[0];
  if (!rightCol) throw new Error('rendered doc has no right column');
  return rightCol.children
    .map((id) => store[id]!)
    .filter((n) => n.name.startsWith('说明块'));
}

/** 块内每个 配图 → 已填图则 `IMG<w×h>`，否则其占位文案。 */
function figuresIn(store: NodeStore, blockId: string): string[] {
  return collectByName(store, blockId, '配图').map((g) => {
    const rect = collectByName(store, g.id, '配图占位')[0] as
      | (NodeStore[string] & { fill?: string })
      | undefined;
    if (rect?.fill) {
      const bb = rect.absoluteBoundingBox!;
      const hints = collectByName(store, g.id, '配图占位文案');
      return `IMG<${bb.width}×${bb.height}>${hints.length > 0 ? '+hint' : ''}`;
    }
    return collectByName(store, g.id, '配图占位文案')[0]?.characters ?? '?';
  });
}

const TWO_FIGURES = `## 01. 战斗界面

### 阶段与倒计时
@GUI

- a
- 配图：A
- b
- 配图：B
`;

describe('配图资产按键填充且占位尺寸按图片比例', () => {
  it('键按簇内顺序匹配：只填 01/1/2，01/1/1 保留文案', async () => {
    const m = makeBackend();
    m.addSource('S', 1920, 1080);

    const r = await renderV2MarkdownToFigma(
      { markdown: doc(TWO_FIGURES), assetMap: { '01/1/2': node('S') } },
      m.backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const bs = blocks(m.store, r.rootInstanceId!);
    expect(figuresIn(m.store, bs[0]!.id)).toEqual(['配图占位：A', 'IMG<1231×692>']);
    expect(r.summary?.figuresPlaced).toBe(1);
  });

  it('K 跨 #### 连续计数', async () => {
    const m = makeBackend();
    m.addSource('S', 400, 200);

    const r = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI

#### 基础
- a
- 配图：一

#### 反馈
- b
- 配图：二
`),
        assetMap: { '01/1/2': node('S') }
      },
      m.backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const bs = blocks(m.store, r.rootInstanceId!);
    expect(figuresIn(m.store, bs[0]!.id)).toEqual(['配图占位：一', 'IMG<400×200>']);
    expect(r.warnings).toEqual([]);
  });

  it('按裁剪区域比例定尺寸，上限为说明块宽，文案被删除', async () => {
    const m = makeBackend();
    m.addSource('S', 3000, 3000);

    const r = await renderV2MarkdownToFigma(
      {
        markdown: doc(TWO_FIGURES),
        assetMap: { '01/1/1': node('S', { crop: { x: 100, y: 200, width: 1920, height: 1080 } }) }
      },
      m.backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(m.figureFills).toHaveLength(1);
    expect(m.figureFills[0]).toMatchObject({
      sourceNodeId: 'S',
      crop: { x: 100, y: 200, width: 1920, height: 1080 },
      maxWidth: 1231,
      result: { width: 1231, height: 692 }
    });
    const bs = blocks(m.store, r.rootInstanceId!);
    expect(figuresIn(m.store, bs[0]!.id)).toEqual(['IMG<1231×692>', '配图占位：B']);
  });

  it('小图不放大', async () => {
    const m = makeBackend();
    m.addSource('STRIP', 50, 636);

    const r = await renderV2MarkdownToFigma(
      { markdown: doc(TWO_FIGURES), assetMap: { '01/1/1': node('STRIP') } },
      m.backend
    );

    const bs = blocks(m.store, r.rootInstanceId!);
    expect(figuresIn(m.store, bs[0]!.id)[0]).toBe('IMG<50×636>');
  });

  it('单张失败不中断：告警带 nodeId，占位保留文案，其余照常填', async () => {
    const m = makeBackend();
    m.addSource('S', 600, 300);

    const r = await renderV2MarkdownToFigma(
      {
        markdown: doc(TWO_FIGURES),
        assetMap: { '01/1/1': node('999:1'), '01/1/2': node('S') }
      },
      m.backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const bs = blocks(m.store, r.rootInstanceId!);
    expect(figuresIn(m.store, bs[0]!.id)).toEqual(['配图占位：A', 'IMG<600×300>']);
    expect(r.summary?.figuresPlaced).toBe(1);
    const failed = r.warnings.filter((w) => w.code === 'V2_W_FIGURE_FILL_FAILED');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.message).toMatch(/01\/1\/1/);
    expect(failed[0]!.message).toMatch(/999:1/);
  });

  it('未匹配键告警且不阻断', async () => {
    const m = makeBackend();

    const r = await renderV2MarkdownToFigma(
      {
        markdown: doc(TWO_FIGURES),
        assetMap: {
          '01/9/1': node('S'),
          '01/1/3': node('S'),
          '05': { type: 'skip' },
          'bogus': { type: 'skip' }
        }
      },
      m.backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const unmatched = r.warnings
      .filter((w) => w.code === 'V2_W_ASSET_KEY_UNMATCHED')
      .map((w) => w.context);
    expect(unmatched.sort()).toEqual(['01/1/3', '01/9/1', '05', 'bogus']);
    expect(m.figureFills).toHaveLength(0);
  });

  it('多图簇落在无配图的 说明块02 也能填（种子克隆出的 配图 带 RECTANGLE）', async () => {
    const m = makeBackend();
    m.addSource('S', 800, 400);

    const r = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 血条
@GUI

- h

### 地图卡片
@GUI

- 默认
- 配图：默认态
- 选中
- 配图：选中态
`),
        assetMap: { '01/2/1': node('S'), '01/2/2': node('S') }
      },
      m.backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const bs = blocks(m.store, r.rootInstanceId!);
    expect(figuresIn(m.store, bs[1]!.id)).toEqual(['IMG<800×400>', 'IMG<800×400>']);
    expect(r.summary?.figuresPlaced).toBe(2);
  });

  it('不传配图键时不调用 fillFigurePlaceholder，结果与之前一致', async () => {
    const m = makeBackend();

    const r = await renderV2MarkdownToFigma(
      { markdown: doc(TWO_FIGURES), assetMap: { '01': { type: 'skip' } } },
      m.backend
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(m.figureFills).toHaveLength(0);
    expect(r.summary?.figuresPlaced).toBe(0);
    expect(r.warnings).toEqual([]);
    const bs = blocks(m.store, r.rootInstanceId!);
    expect(figuresIn(m.store, bs[0]!.id)).toEqual(['配图占位：A', '配图占位：B']);
  });
});
