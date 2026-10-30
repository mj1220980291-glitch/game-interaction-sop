/**
 * 渲染期接上自适应：根帧纵向自动布局，部件自带 HUG 链时不再手工压高。
 *
 * Spec: openspec/changes/template-adaptive-shell (D3)
 */

import { describe, it, expect } from 'vitest';
import { parseV2 } from '../../src/v2/parser.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { renderFromParts, placeholderPaint, placeholderHintPaint } from '../../src/v2/render/parts/index.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';
import { BADGE_MASTER_NAME } from '../../src/v2/template-slots.js';
import { partsBackend, type PNodeSpec, type PartsBackend } from './helpers/parts-backend.js';

const MD = `# 设置面板

跟进UI：苗儿
需求组：OGC2
易协作链接：#待补充
最后更新时间：2026.05.27

## 设计总览

### 功能背景

玩家在局内需要快速查看当前状态。

### 核心交互

点击入口打开面板。

## 01. 设置面板

### 打开设置
@GUI

- 点击入口
`;

type Call = Parameters<NonNullable<FigmaBackend['setAutoLayout']>>[0];
type Paint = Parameters<NonNullable<FigmaBackend['setNodePaint']>>[0];

/** 带一张配图的版本：用来验占位文案是否压在灰板正中。 */
const MD_FIGURE = `${MD}- 配图：示意图
`;

function addPaint(h: PartsBackend): Paint[] {
  const calls: Paint[] = [];
  (h.backend as unknown as { setNodePaint: (p: Paint) => Promise<void> }).setNodePaint = async (p) => {
    calls.push(p);
  };
  return calls;
}

function addAutoLayout(h: PartsBackend): Call[] {
  const calls: Call[] = [];
  (h.backend as unknown as { setAutoLayout: (p: Call) => Promise<void> }).setAutoLayout = async (p) => {
    calls.push(p);
    const node = h.nodes.get(p.nodeId);
    if (node) node.layoutMode = p.mode;
  };
  return calls;
}

function topSpec(): PNodeSpec {
  return {
    id: 't-root',
    name: '顶部',
    type: 'COMPONENT',
    width: 1920,
    height: 320,
    children: [{ id: 't-title', name: '文档标题', type: 'TEXT', characters: '旧', width: 300, height: 40 }]
  };
}

function chapterSpec(opts: { autoLayout?: boolean; imageY?: number } = {}): PNodeSpec {
  return {
    id: 'c-root',
    name: '章节',
    type: 'COMPONENT',
    width: 2209,
    height: 6240,
    ...(opts.autoLayout ? { layoutMode: 'HORIZONTAL' as const } : {}),
    children: [
      { id: 'c-name', name: '#Name', type: 'TEXT', characters: '旧章节', width: 300, height: 70 },
      { id: 'c-img', name: '主图占位', type: 'RECTANGLE', width: 1200, height: 745, y: opts.imageY ?? 0 },
      {
        id: 'c-bubble',
        name: '气泡',
        type: 'FRAME',
        width: 1920,
        height: 1080,
        children: [
          {
            id: 'c-master',
            name: BADGE_MASTER_NAME,
            type: 'FRAME',
            width: 48,
            height: 48,
            visible: false,
            children: [{ id: 'c-master-n', name: '#Number', type: 'TEXT', characters: '0', width: 40, height: 40 }]
          }
        ]
      },
      { id: 'c-col', name: 'Text', type: 'FRAME', width: 932, height: 900 }
    ]
  };
}

function clusterSpec(opts: { withFigure?: boolean } = {}): PNodeSpec {
  const figure: PNodeSpec[] = opts.withFigure
    ? [
        {
          id: 'k-fig',
          name: '配图',
          type: 'GROUP',
          width: 872,
          height: 490,
          children: [
            { id: 'k-fig-rect', name: '配图占位', type: 'RECTANGLE', width: 872, height: 490 },
            {
              id: 'k-fig-hint',
              name: '配图占位文案',
              type: 'TEXT',
              characters: '配图占位：旧',
              width: 832,
              height: 52,
              x: 22,
              y: 407
            }
          ]
        }
      ]
    : [];
  return {
    id: 'k-root',
    name: '簇',
    type: 'COMPONENT',
    width: 932,
    height: 400,
    children: [
      {
        id: 'k-num',
        name: 'Number',
        type: 'INSTANCE',
        width: 44,
        height: 40,
        children: [{ id: 'k-num-text', name: 'numText', type: 'TEXT', characters: '9', width: 20, height: 34 }]
      },
      { id: 'k-title', name: '#Title_Main', type: 'TEXT', characters: '旧标题', width: 300, height: 50 },
      { id: 'k-b1', name: '正文/规则', type: 'TEXT', characters: '旧一', width: 800, height: 44 },
      { id: 'k-b2', name: '正文/规则', type: 'TEXT', characters: '旧二', width: 800, height: 44 },
      ...figure
    ]
  };
}

function setup(
  chapterOpts: { autoLayout?: boolean; imageY?: number } = {},
  extra: { withFigure?: boolean } = {}
) {
  const parsed = parseV2(extra.withFigure ? MD_FIGURE : MD);
  if (!parsed.ir) throw new Error(parsed.errors.map((e) => e.message).join('; '));
  const pack = parseTemplatePack({
    schema_version: 1,
    project: '测试项目',
    components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster' },
    capabilities: {
      overview: 'none',
      clusterGroups: 'none',
      badgeSlot: 'container',
      numberBadge: 'text',
      roleAnnotation: 'component-variant',
      figure: extra.withFigure ? 'named-group' : 'none',
      hiddenPool: 'ignore',
      column: 'right'
    }
  });
  if (!pack.ok) throw new Error(pack.errors.join('; '));

  const h = partsBackend({ id: 'page-root', name: 'Page', type: 'PAGE', width: 4000, height: 4000 });
  h.registerComponent('k-top', topSpec());
  h.registerComponent('k-chapter', chapterSpec(chapterOpts));
  h.registerComponent('k-cluster', clusterSpec({ ...(extra.withFigure ? { withFigure: true } : {}) }));
  return { h, ir: parsed.ir, pack: pack.pack };
}

describe('renderFromParts 自适应', () => {
  it('根帧建成纵向自动布局，间距按部件间隔', async () => {
    const { h, ir, pack } = setup();
    const calls = addAutoLayout(h);

    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    expect(calls[0]).toMatchObject({ nodeId: r.rootId, mode: 'VERTICAL', hugHeight: true });
    expect(h.nodes.get(r.rootId)!.layoutMode).toBe('VERTICAL');
  });

  it('配图占位文案压在灰板正中（水平 + 垂直）', async () => {
    const { h, ir, pack } = setup({}, { withFigure: true });
    addAutoLayout(h);
    addPaint(h);

    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const rect = h.byName(r.rootId, '配图占位')[0]!;
    const hint = h.byName(r.rootId, '配图占位文案')[0]!;
    expect(hint.x).toBe(Math.round(rect.x + (rect.width - hint.width) / 2));
    expect(hint.y).toBe(Math.round(rect.y + (rect.height - hint.height) / 2));
  });

  it('geometry.rootGap 写进根帧 itemSpacing', async () => {    const { h, ir, pack } = setup();
    const calls = addAutoLayout(h);

    await renderFromParts({
      ir,
      pack: { ...pack, geometry: { rootGap: 60 } },
      pageId: 'page-root',
      backend: h.backend
    });

    expect(calls[0]?.itemSpacing).toBe(60);
  });

  it('geometry.docPadding：根帧加内边距，宽度含左右边距', async () => {
    const { h, ir, pack } = setup();
    const calls = addAutoLayout(h);

    const r = await renderFromParts({
      ir,
      pack: { ...pack, geometry: { docPadding: { top: 0, right: 60, bottom: 0, left: 60 } } },
      pageId: 'page-root',
      backend: h.backend
    });

    expect(calls[0]?.padding).toEqual({ top: 0, right: 60, bottom: 0, left: 60 });
    // 章节 2209 + 左右各 60
    expect(h.nodes.get(r.rootId)!.width).toBe(2329);
  });

  it('geometry.footerGap：结尾前插一块同宽的留白帧', async () => {
    const { h, ir, pack } = setup();
    addAutoLayout(h);
    h.registerComponent('k-footer', {
      id: 'f-root',
      name: '结尾',
      type: 'COMPONENT',
      width: 2198,
      height: 192
    });

    const r = await renderFromParts({
      ir,
      pack: {
        ...pack,
        components: { ...pack.components, footer: 'k-footer' },
        geometry: { footerGap: 200 }
      },
      pageId: 'page-root',
      backend: h.backend
    });

    const spacer = h.byName(r.rootId, '底部留白')[0];
    expect(spacer).toBeDefined();
    expect(spacer!.height).toBe(200);
    expect(h.byName(r.rootId, '结尾')).toHaveLength(1);
  });

  it('部件自带 HUG 链时跳过手工压章节高度', async () => {
    const { h, ir, pack } = setup({ autoLayout: true });
    addAutoLayout(h);

    await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const chapter = h.byName(h.root().id, '界面说明1')[0]!;
    expect(h.nodes.get(chapter.id)!.height).toBe(6240); // 没被 resizeNode 改过
  });

  it('部件不带 HUG 链时仍然兜住（保留 chapter.fit）', async () => {
    const { h, ir, pack } = setup();
    addAutoLayout(h);

    await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const chapter = h.byName(h.root().id, '界面说明1')[0]!;
    expect(h.nodes.get(chapter.id)!.height).toBeLessThan(6240);
  });

  it('后端没有 setAutoLayout 时回落手工排版', async () => {
    const { h, ir, pack } = setup();

    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const parts = h.childrenOf(r.rootId);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.y >= 0)).toBe(true);
    expect(h.calls.some((c) => c.startsWith('reparent:'))).toBe(true);
  });

  it('簇编号在实例内部时也能写入（按结构找，不靠名字）', async () => {
    const { h, ir, pack } = setup();
    addAutoLayout(h);

    await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const inner = h.byName(h.root().id, 'numText')[0]!;
    expect(inner.characters).toBe('1');
  });

  it('根帧刷白底、主图占位换虚线灰框（无配图时）', async () => {
    const { h, ir, pack } = setup();
    addAutoLayout(h);
    const paints = addPaint(h);

    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const rootPaint = paints.find((p) => p.nodeId === r.rootId);
    expect(rootPaint?.fill).toBe('#FFFFFF');
    const placeholder = paints.find((p) => p.fill === '#F5F5F5');
    expect(placeholder?.dash).toBe(true);
  });

  it('深色模板：根帧用 docBackground，占位块跟着变暗', async () => {
    const { h, ir, pack } = setup();
    addAutoLayout(h);
    const paints = addPaint(h);

    const r = await renderFromParts({
      ir,
      pack: { ...pack, docBackground: '#232429' },
      pageId: 'page-root',
      backend: h.backend
    });

    expect(paints.find((p) => p.nodeId === r.rootId)?.fill).toBe('#232429');
    const placeholder = paints.find((p) => p.dash === true);
    expect(placeholder?.fill).not.toBe('#F5F5F5');
    expect(placeholder?.fill).toBe(placeholderPaint('#232429').fill);
  });

  it('标号落在主图矩形内（主图不是 1920×1080 时）', async () => {
    // 蛋仔的真实几何：主图 1200×745 从 (0,807) 开始，气泡铺满 1920×1080。
    const { h, ir, pack } = setup({ imageY: 807 });
    addAutoLayout(h);

    await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const rootId = h.root().id;
    const badge = h.byName(rootId, '标号/1')[0]!;
    expect(badge.x).toBeGreaterThanOrEqual(0);
    expect(badge.x).toBeLessThanOrEqual(1200 - badge.width);
    expect(badge.y).toBeGreaterThanOrEqual(807);
    expect(badge.y).toBeLessThanOrEqual(807 + 745 - badge.height);

    // 气泡本身也缩到主图尺寸，否则 1920×1080 的框会盖住说明栏。
    const bubble = h.byName(rootId, '气泡')[0]!;
    expect(bubble.width).toBe(1200);
    expect(bubble.height).toBe(745);
  });
});

describe('placeholderPaint', () => {
  it('没有 docBackground 时维持原来的中性灰', () => {
    expect(placeholderPaint()).toEqual({ fill: '#F5F5F5', stroke: '#BFBFBF' });
  });

  it('深底往白里混：占位比底色亮，不再是一块白纸', () => {
    const p = placeholderPaint('#232429');
    expect(p.fill).not.toBe('#F5F5F5');
    const base = 0x23;
    const fill = Number.parseInt(p.fill.slice(1, 3), 16);
    expect(fill).toBeGreaterThan(base);
    expect(fill).toBeLessThan(0x60);
  });

  it('浅底往黑里混，仍然是接近白的浅灰', () => {
    const p = placeholderPaint('#FFFFFF');
    expect(p.fill).toBe('#F5F5F5');
    expect(p.stroke).toBe('#BFBFBF');
  });

  it('非法值回落中性灰', () => {
    expect(placeholderPaint('black').fill).toBe('#F5F5F5');
  });
});

describe('placeholderHintPaint', () => {
  it('深板上的文案取亮灰，黑字不再压在深灰上', () => {
    const hint = placeholderHintPaint('#454545');
    const luma = (h: string): number => {
      const n = Number.parseInt(h.slice(1), 16);
      return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    };
    expect(luma(hint!)).toBeGreaterThan(0.5);
  });

  it('浅板上的文案取深灰', () => {
    const hint = placeholderHintPaint('#F5F5F5');
    expect(Number.parseInt(hint!.slice(1, 3), 16)).toBeLessThan(0xa0);
  });

  it('没有板色时不猜', () => {
    expect(placeholderHintPaint()).toBeUndefined();
    expect(placeholderHintPaint('black')).toBeUndefined();
  });
});
