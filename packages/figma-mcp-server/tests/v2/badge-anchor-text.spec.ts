/**
 * 文本锚点（E4）—— 不传坐标，按主图内控件文本自动落标号。
 *
 * 历史行为：`badgeAnchors` 只收归一化坐标，不传就全部堆在模板网格上，
 * 且 `warnings: []`。M1/M2/M3 三轮都是这么被打回的。
 *
 * 现在：
 *   - `{ text, offset }` 由引擎在主图子树里找控件、读 bbox 换算；
 *   - 找不到 → 退回网格 + `V2_W_BADGE_ANCHOR_TEXT_NOT_FOUND`；
 *   - 同名多个 → 取第一个 + `V2_W_BADGE_ANCHOR_TEXT_AMBIGUOUS`（`occurrence` 指定）；
 *   - 整表不传 → `V2_W_BADGE_ANCHOR_DEFAULTED`，不再静默。
 */

import { describe, it, expect } from 'vitest';
import { parseV2 } from '../../src/v2/parser.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { renderFromParts } from '../../src/v2/render/parts/index.js';
import { placeBadges } from '../../src/v2/render/parts/geometry.js';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { parseBadgeAnchors } from '../../src/v2/badge-anchor.js';
import { BADGE_MASTER_NAME } from '../../src/v2/template-slots.js';
import { partsBackend, type PNodeSpec, type PartsBackend } from './helpers/parts-backend.js';
import { makeBackend } from './helpers/mock-backend.js';

const MD = `# 文本锚点

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.11.03

## 设计总览

### 功能背景

背景。

### 核心交互

交互。

## 01. 设置面板

### 打开设置
@GUI

- 点击 Click to input

### 关闭设置
@GUI

- 点击关闭
`;

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

function chapterSpec(): PNodeSpec {
  return {
    id: 'c-root',
    name: '章节',
    type: 'COMPONENT',
    width: 2209,
    height: 6240,
    children: [
      { id: 'c-name', name: '#Name', type: 'TEXT', characters: '旧章节', width: 300, height: 70 },
      {
        id: 'c-img',
        name: '主图占位',
        type: 'RECTANGLE',
        width: 1200,
        height: 745,
        x: 0,
        y: 0,
        // 主图里的「控件」：文字锚点就是在这一层找的。
        children: [
          {
            id: 'c-input',
            name: 'Click to input',
            type: 'TEXT',
            characters: 'Click to input',
            x: 100,
            y: 50,
            width: 240,
            height: 40
          },
          {
            id: 'c-dup',
            name: 'Click to input',
            type: 'TEXT',
            characters: 'Click to input',
            x: 600,
            y: 400,
            width: 240,
            height: 40
          }
        ]
      },
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

function clusterSpec(): PNodeSpec {
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
      { id: 'k-b2', name: '正文/规则', type: 'TEXT', characters: '旧二', width: 800, height: 44 }
    ]
  };
}

function setup(): { h: PartsBackend; ir: NonNullable<ReturnType<typeof parseV2>['ir']>; pack: never } {
  const parsed = parseV2(MD);
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
      figure: 'none',
      hiddenPool: 'ignore',
      column: 'right'
    }
  });
  if (!pack.ok) throw new Error(pack.errors.join('; '));

  const h = partsBackend({ id: 'page-root', name: 'Page', type: 'PAGE', width: 4000, height: 4000 });
  h.registerComponent('k-top', topSpec());
  h.registerComponent('k-chapter', chapterSpec());
  h.registerComponent('k-cluster', clusterSpec());
  return { h, ir: parsed.ir, pack: pack.pack as never };
}

describe('parseBadgeAnchors — 两种写法', () => {
  it('文本锚点与坐标锚点可以混用，非法项被丢弃', () => {
    const map = parseBadgeAnchors({
      '01/1': { text: 'Click to input', offset: [-24, -24] },
      '01/2': { x: 0.5, y: 0.6, note: '关闭' },
      '01/3': { text: '' },
      '01/4': { x: 'a', y: 1 }
    });
    expect(map).toEqual({
      '01/1': { text: 'Click to input', offset: [-24, -24] },
      '01/2': { x: 0.5, y: 0.6, note: '关闭' }
    });
  });
});

describe('文本锚点 badgeAnchors[].text', () => {
  it('按主图内控件文本定位：标号左上角 = 控件左上角 + offset', async () => {
    const { h, ir, pack } = setup();

    const r = await renderFromParts({
      ir,
      pack,
      pageId: 'page-root',
      backend: h.backend,
      badgeAnchors: {
        '01/1': { text: 'Click to input', occurrence: 1, offset: [-24, -24] },
        '01/2': { text: 'Click to input', occurrence: 2, offset: [0, 0] }
      }
    });

    // 主图 1200×745，控件 (100,50)；offset(-24,-24) → (76,26)
    const b1 = h.byName(r.rootId, '标号/1')[0]!;
    expect([b1.x, b1.y]).toEqual([76, 26]);
    // 第二个控件 (600,400)
    const b2 = h.byName(r.rootId, '标号/2')[0]!;
    expect([b2.x, b2.y]).toEqual([600, 400]);
    expect(r.warnings.filter((w) => w.code.startsWith('V2_W_BADGE_ANCHOR'))).toEqual([]);
  });

  it('同名控件未指定 occurrence：取第一个并告警', async () => {
    const { h, ir, pack } = setup();

    const r = await renderFromParts({
      ir,
      pack,
      pageId: 'page-root',
      backend: h.backend,
      badgeAnchors: {
        '01/1': { text: 'Click to input' },
        '01/2': { text: '不存在控件' }
      }
    });

    const ambiguous = r.warnings.filter((w) => w.code === 'V2_W_BADGE_ANCHOR_TEXT_AMBIGUOUS');
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0]!.context).toBe('01/1');
    const notFound = r.warnings.filter((w) => w.code === 'V2_W_BADGE_ANCHOR_TEXT_NOT_FOUND');
    expect(notFound).toHaveLength(1);
    expect(notFound[0]!.context).toBe('01/2');
    // 找不到的那个退回网格，不与 0 号重合。
    const b2 = h.byName(r.rootId, '标号/2')[0]!;
    expect([b2.x, b2.y]).not.toEqual([0, 0]);
  });

  it('整表不传：不再静默，给 V2_W_BADGE_ANCHOR_DEFAULTED', async () => {
    const { h, ir, pack } = setup();

    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });
    // renderFromParts 是内部入口：默认告警由 renderV2MarkdownToFigma 统一发。
    expect(r.warnings.filter((w) => w.code === 'V2_W_BADGE_ANCHOR_DEFAULTED')).toEqual([]);
  });
});

describe('渲染入口的缺省锚点告警', () => {  it('簇数 > 0 且未传 badgeAnchors：返回 V2_W_BADGE_ANCHOR_DEFAULTED', async () => {
    const m = makeBackend();
    const r = await renderV2MarkdownToFigma({ markdown: MD }, m.backend);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const warn = r.warnings.filter((w) => w.code === 'V2_W_BADGE_ANCHOR_DEFAULTED');
    expect(warn).toHaveLength(1);
    expect(warn[0]!.message).toContain('badgeAnchors');
  });

  it('传了 badgeAnchors（哪怕只覆盖一个簇）就不报缺省告警', async () => {
    const m = makeBackend();
    const r = await renderV2MarkdownToFigma(
      { markdown: MD, badgeAnchors: { '01/1': { text: 'Click to input' } } },
      m.backend
    );
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings.filter((w) => w.code === 'V2_W_BADGE_ANCHOR_DEFAULTED')).toEqual([]);
  });
});

describe('E5 标号删除时序：先补齐、后清理', () => {
  it('克隆中途失败时，原有标号不能被提前删掉', async () => {
    const { h, ir, pack } = setup();
    const first = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });
    const chapter = h.byName(first.rootId, '界面说明1')[0]!;
    expect(h.byName(chapter.id, '标号/1')).toHaveLength(1);
    expect(h.byName(chapter.id, '标号/2')).toHaveLength(1);

    const failing: typeof h.backend = {
      ...h.backend,
      async cloneNode() {
        throw new Error('Unable to establish connection to Figma after 10 seconds');
      }
    };
    const warnings: Array<{ code: string; message: string }> = [];
    await expect(
      placeBadges(
        failing,
        chapter.id,
        4,
        '01',
        warnings as never,
        'container',
        [],
        undefined,
        undefined
      )
    ).rejects.toThrow(/10 seconds/);

    // 旧实现会在克隆前把这两个删掉，于是失败后整章一个标号都不剩。
    expect(h.byName(chapter.id, '标号/1')).toHaveLength(1);
    expect(h.byName(chapter.id, '标号/2')).toHaveLength(1);
  });
});
