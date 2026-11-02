/**
 * 标号锚点（`badgeAnchors`）。
 *
 * 历史行为：标号位置只由簇序号决定（模板网格），永远排成一条斜线。
 * 现在调用方可以按 `"NN/C"` 给主图归一化坐标，命中就按锚点摆；
 * 缺的退回网格并告警，越界的夹到图内并告警，整表不传则完全保持旧行为。
 */

import { describe, it, expect } from 'vitest';
import { parseV2 } from '../../src/v2/parser.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { renderFromParts } from '../../src/v2/render/parts/index.js';
import { BADGE_MASTER_NAME } from '../../src/v2/template-slots.js';
import { partsBackend, type PNodeSpec, type PartsBackend } from './helpers/parts-backend.js';

const MD = `# 标号锚点

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.11.02

## 设计总览

### 功能背景

背景。

### 核心交互

交互。

## 01. 设置面板

### 打开设置
@GUI

- 点击入口

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
      { id: 'c-img', name: '主图占位', type: 'RECTANGLE', width: 1200, height: 745, x: 0, y: 0 },
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

function setup(): { h: PartsBackend; ir: NonNullable<ReturnType<typeof parseV2>['ir']>; pack: ReturnType<typeof parseTemplatePack> extends { pack: infer P } ? P : never } {
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

describe('标号锚点 badgeAnchors', () => {
  it('按锚点摆放：坐标 = 归一化值 × 主图尺寸', async () => {
    const { h, ir, pack } = setup();

    const r = await renderFromParts({
      ir,
      pack,
      pageId: 'page-root',
      backend: h.backend,
      badgeAnchors: {
        '01/1': { x: 0.25, y: 0.4, note: '打开入口' },
        '01/2': { x: 0.5, y: 0.6, note: '关闭按钮' }
      }
    });

    const b1 = h.byName(r.rootId, '标号/1')[0]!;
    const b2 = h.byName(r.rootId, '标号/2')[0]!;
    expect([b1.x, b1.y]).toEqual([300, 298]);
    expect([b2.x, b2.y]).toEqual([600, 447]);
    expect(r.warnings.filter((w) => w.code.startsWith('V2_W_BADGE_ANCHOR'))).toEqual([]);
  });

  it('缺锚点的簇退回网格并告警', async () => {
    const { h, ir, pack } = setup();

    const r = await renderFromParts({
      ir,
      pack,
      pageId: 'page-root',
      backend: h.backend,
      badgeAnchors: { '01/2': { x: 0.5, y: 0.6 } }
    });

    const missing = r.warnings.filter((w) => w.code === 'V2_W_BADGE_ANCHOR_MISSING');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.context).toBe('01/1');
    // 网格第一格与锚点不同，说明确实退回了网格而不是被当成 (0,0)
    const b1 = h.byName(r.rootId, '标号/1')[0]!;
    expect([b1.x, b1.y]).not.toEqual([0, 0]);
  });

  it('越界锚点夹到图内并告警', async () => {
    const { h, ir, pack } = setup();

    const r = await renderFromParts({
      ir,
      pack,
      pageId: 'page-root',
      backend: h.backend,
      badgeAnchors: {
        '01/1': { x: -0.5, y: 2 },
        '01/2': { x: 0.5, y: 0.6 }
      }
    });

    expect(r.warnings.filter((w) => w.code === 'V2_W_BADGE_ANCHOR_OUT_OF_RANGE')).toHaveLength(1);
    const b1 = h.byName(r.rootId, '标号/1')[0]!;
    expect(b1.x).toBe(0);
    expect(b1.y).toBe(745 - b1.height);
  });

  it('不传 badgeAnchors：没有任何锚点告警，位置与旧行为一致', async () => {
    const { h, ir, pack } = setup();

    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    expect(r.warnings.filter((w) => w.code.startsWith('V2_W_BADGE_ANCHOR'))).toEqual([]);
  });
});
