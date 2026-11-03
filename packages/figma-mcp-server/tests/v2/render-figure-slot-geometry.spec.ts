/**
 * 一簇多张配图的几何回归（真机反馈 2026-11-02）。
 *
 * 症状：第 2 张起 `配图占位` 的 y 沿文档流累加、矩形被压成几十像素、`配图占位文案`
 * 压成 1~6px 或丢失，整组溢出簇框，而且零告警。
 *
 * 锁的行为：克隆出来的每个槽在渲染结束时都满足「矩形回到组内原点 / 文案贴在下方 /
 * 组高 = 槽高 + 间距 + 文案高」，违反时出 `V2_W_FIGURE_SLOT_GEOMETRY`。
 *
 * Spec: template-render「配图槽克隆后几何归一」
 */

import { describe, it, expect } from 'vitest';
import { parseV2 } from '../../src/v2/parser.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { renderFromParts } from '../../src/v2/render/parts/index.js';
import { figureSlotGeometryProblems } from '../../src/v2/render.js';
import { SOFT_WARNING_CODES } from '../../src/v2/ir.js';
import { partsBackend, type PNodeSpec, type PartsBackend } from './helpers/parts-backend.js';

const MD = `# 命名输入框

跟进UI：a
需求组：b
易协作链接：#待补充
最后更新时间：2026.11.02

## 设计总览

### 功能背景

玩家创建角色时需要命名。

### 核心交互

点击输入框唤出键盘。

## 01. 命名面板

### 命名输入框
@GUI @程序

#### 控件状态
- 默认状态：显示占位文案
- 配图：命名输入框与标题
- 悬停状态：描边高亮
- 配图：输入框悬停态
- 选中状态：青色描边
- 配图：输入框选中态
`;

const TEMPLATE_GAP = 16;
const RECT_H = 240;
const HINT_H = 70;

function topSpec(): PNodeSpec {
  const header = (id: string, name: string, text: string): PNodeSpec => ({
    id,
    name,
    type: 'TEXT',
    characters: text,
    width: 300,
    height: 40
  });
  return {
    id: 't-root',
    name: '顶部',
    type: 'COMPONENT',
    width: 1920,
    height: 320,
    children: [
      header('t-title', '文档标题', '旧文档'),
      header('t-owner', '设计师名称', '旧人'),
      header('t-group', '需求组名称', '旧组'),
      header('t-ticket', '易协作单号链接', '旧链接'),
      header('t-updated', '更新时间', '旧日期')
    ]
  };
}

function chapterSpec(): PNodeSpec {
  return {
    id: 'ch-root',
    name: '章节',
    type: 'COMPONENT',
    width: 3382,
    height: 1600,
    layoutMode: 'HORIZONTAL',
    children: [
      { id: 'ch-name', name: '#Name', type: 'TEXT', characters: '旧章节', width: 400, height: 60 },
      { id: 'ch-main', name: '主图占位', type: 'RECTANGLE', width: 1920, height: 1080 },
      {
        id: 'ch-badges',
        name: '气泡',
        type: 'FRAME',
        width: 1920,
        height: 1080,
        children: [
          {
            id: 'ch-master',
            name: '标号/母版',
            type: 'FRAME',
            width: 48,
            height: 48,
            visible: false,
            children: [
              { id: 'ch-master-n', name: '#Number', type: 'TEXT', characters: '0', width: 40, height: 40 }
            ]
          }
        ]
      },
      { id: 'ch-column', name: 'Text', type: 'FRAME', width: 1200, height: 1200, layoutMode: 'VERTICAL', children: [] }
    ]
  };
}

function clusterSpec(opts: { withHint?: boolean; figureY?: number } = {}): PNodeSpec {
  const withHint = opts.withHint !== false;
  const figureY = opts.figureY ?? 0;
  return {
    id: 'k-root',
    name: '簇',
    type: 'COMPONENT',
    width: 1200,
    height: 800,
    children: [
      { id: 'k-num', name: 'Number', type: 'TEXT', characters: '9', width: 40, height: 40 },
      { id: 'k-title', name: '#Title_Main', type: 'TEXT', characters: '旧簇标题', width: 300, height: 50 },
      { id: 'k-sub', name: '#Title', type: 'TEXT', characters: '旧分组', width: 200, height: 40 },
      { id: 'k-b1', name: '正文/规则', type: 'TEXT', characters: '旧内容', width: 900, height: 44 },
      {
        id: 'k-fig',
        name: '配图',
        type: 'GROUP',
        width: 1231,
        height: RECT_H + TEMPLATE_GAP + HINT_H,
        x: 0,
        y: figureY,
        children: [
          { id: 'k-fig-rect', name: '配图占位', type: 'RECTANGLE', width: 1231, height: RECT_H, x: 0, y: figureY },
          ...(withHint
            ? [
                {
                  id: 'k-fig-hint',
                  name: '配图占位文案',
                  type: 'TEXT' as const,
                  characters: '配图占位：待手动替换',
                  width: 1231,
                  height: HINT_H,
                  x: 0,
                  y: figureY + RECT_H + TEMPLATE_GAP
                }
              ]
            : [])
        ]
      }
    ]
  };
}

function makePack(overrides: Record<string, string> = {}) {
  const parsed = parseTemplatePack({
    schema_version: 1,
    project: '测试项目',
    components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster' },
    capabilities: {
      overview: 'two-frames',
      clusterGroups: 'slot-run',
      badgeSlot: 'container',
      numberBadge: 'text',
      roleAnnotation: 'none',
      figure: 'named-group',
      hiddenPool: 'ignore',
      column: 'right',
      ...overrides
    }
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.pack;
}

function setup(opts: { withHint?: boolean; figureY?: number } = {}) {
  const parsed = parseV2(MD);
  if (!parsed.ir) throw new Error(parsed.errors.map((e) => e.message).join('; '));
  const h = partsBackend({ id: 'page-root', name: 'Page', type: 'PAGE' });
  h.registerComponent('k-top', topSpec());
  h.registerComponent('k-chapter', chapterSpec());
  h.registerComponent('k-cluster', clusterSpec(opts));
  return { h, ir: parsed.ir, pack: makePack() };
}

/** 每个 `配图` GROUP 的实测几何。 */
function figureGroups(h: PartsBackend, rootId: string) {
  return h.byName(rootId, '配图').map((group) => {
    const rect = h.byName(group.id, '配图占位')[0];
    const hint = h.byName(group.id, '配图占位文案')[0];
    return { group, rect, hint };
  });
}

describe('一簇多张配图的几何归一', () => {
  it('3 张配图全部落在组内，组高随内容', async () => {
    const { h, ir, pack } = setup();
    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const groups = figureGroups(h, r.rootId);
    expect(groups).toHaveLength(3);
    for (const { group, rect, hint } of groups) {
      expect(rect).toBeDefined();
      expect(rect!.x).toBe(0);
      expect(rect!.y).toBe(0);
      expect(rect!.height).toBe(RECT_H);
      expect(hint).toBeDefined();
      expect(hint!.height).toBeGreaterThanOrEqual(16);
      expect(hint!.y).toBe(RECT_H + TEMPLATE_GAP);
      expect(group.height).toBe(RECT_H + TEMPLATE_GAP + hint!.height);
    }
    const codes = r.warnings.map((w) => w.code);
    expect(codes).not.toContain(SOFT_WARNING_CODES.W_FIGURE_SLOT_GEOMETRY);
    // 归一凭据：真机验收靠这个数确认跑的是新 build。
    expect(r.summary.figureSlotsNormalized).toBe(3);
    expect(r.summary.chaptersNormalized).toBe(1);
  });

  it('缺资产与已填图混合：填图槽删文案，其余槽仍归一', async () => {
    const { h, ir, pack } = setup();
    const r = await renderFromParts({
      ir,
      pack,
      pageId: 'page-root',
      backend: h.backend,
      assetMap: { '01/1/1': { type: 'figma_node', nodeId: 'src-1' } }
    });

    expect(r.summary.figuresPlaced).toBe(1);
    const groups = figureGroups(h, r.rootId);
    expect(groups).toHaveLength(3);
    const filled = groups.find((g) => g.hint === undefined)!;
    expect(filled.rect!.fills).toEqual(['image']);
    // 填图后矩形被压成 5px（真机症状），收尾归一必须把它救回最小可读高度。
    expect(filled.rect!.height).toBeGreaterThanOrEqual(100);
    expect(filled.group.height).toBe(filled.rect!.height);
    for (const { group, rect, hint } of groups.filter((g) => g.hint !== undefined)) {
      expect(rect!.y).toBe(0);
      expect(hint!.y).toBe(rect!.height + TEMPLATE_GAP);
      expect(group.height).toBe(rect!.height + TEMPLATE_GAP + hint!.height);
    }
  });

  it('槽的父级坐标不是原点时，矩形贴组原点而不是父级顶端', async () => {
    const { h, ir, pack } = setup({ figureY: 814 });
    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const groups = figureGroups(h, r.rootId);
    expect(groups).toHaveLength(3);
    for (const { group, rect, hint } of groups) {
      // GROUP 子节点坐标写在父级里：组在 814，矩形就该在 814（不是 0）
      expect(rect!.y).toBe(group.y);
      expect(hint!.y).toBe(group.y + RECT_H + TEMPLATE_GAP);
      expect(group.height).toBe(RECT_H + TEMPLATE_GAP + HINT_H);
    }
    expect(r.warnings.map((w) => w.code)).not.toContain(
      SOFT_WARNING_CODES.W_FIGURE_SLOT_GEOMETRY
    );
  });

  it('槽里没有占位文案时归一后不开裂（组高只按矩形算）', async () => {
    const { h, ir, pack } = setup({ withHint: false });
    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    expect(r.summary.clusterCount).toBe(1);
    for (const { group, rect, hint } of figureGroups(h, r.rootId)) {
      expect(hint).toBeUndefined();
      expect(rect!.y).toBe(0);
      expect(group.height).toBe(rect!.height);
    }
  });
});

describe('figureSlotGeometryProblems — 不变式（绝对坐标口径）', () => {
  const good = {
    groupWidth: 1231,
    groupHeight: 326,
    rectX: 0,
    rectY: 814,
    rectWidth: 1231,
    rectHeight: 240,
    hintX: 0,
    hintY: 1070,
    hintWidth: 1231,
    hintHeight: 70,
    groupAbs: { x: 0, y: 814, width: 1231, height: 326 },
    rectAbs: { x: 0, y: 814, width: 1231, height: 240 },
    hintAbs: { x: 0, y: 1070, width: 1231, height: 70 },
    autoLayout: false
  };

  it('GROUP 子节点的局部 y 不等于 0 也算合格（坐标写在父级里）', () => {
    expect(figureSlotGeometryProblems(good)).toEqual([]);
  });

  it('矩形真的偏离组原点才报', () => {
    expect(
      figureSlotGeometryProblems({
        ...good,
        rectAbs: { ...good.rectAbs, y: 814 + 891 }
      }).join()
    ).toContain('组左上角');
  });

  it('文案被压扁就报', () => {
    expect(
      figureSlotGeometryProblems({ ...good, hintAbs: { ...good.hintAbs, height: 4 } }).join()
    ).toContain('压到');
  });

  it('文案压在矩形上、组高不符都报', () => {
    const problems = figureSlotGeometryProblems({
      ...good,
      hintAbs: { x: 0, y: 820, width: 1231, height: 70 },
      groupAbs: { ...good.groupAbs, height: 27 }
    });
    expect(problems.join()).toContain('压在矩形上');
    expect(problems.join()).toContain('组高');
  });

  it('auto-layout 的组只校验子节点，不校验组高', () => {
    expect(
      figureSlotGeometryProblems({
        ...good,
        autoLayout: true,
        groupAbs: { ...good.groupAbs, height: 999 }
      })
    ).toEqual([]);
  });
});
