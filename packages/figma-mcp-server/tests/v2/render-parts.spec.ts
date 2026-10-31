/**
 * 多部件渲染：拼装 / 清空原稿 / 标号 / 能力冲突。
 *
 * Spec: template-render
 */

import { describe, it, expect } from 'vitest';
import { parseV2 } from '../../src/v2/parser.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { renderFromParts, PARTS_RENDER_CODES } from '../../src/v2/render/parts/index.js';
import { BADGE_MASTER_NAME } from '../../src/v2/template-slots.js';
import { partsBackend, type PNodeSpec } from './helpers/parts-backend.js';

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
@GUI @程序

- 点击入口
- 面板弹出

## 02. 背包面板

### 查看物品
@GUI

- 点击物品
`;

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
      header('t-updated', '更新时间', '旧日期'),
      {
        id: 't-bg',
        name: '功能背景',
        type: 'FRAME',
        width: 1200,
        height: 140,
        children: [
          { id: 't-bg-h', name: '#Title', type: 'TEXT', characters: '1.功能背景', width: 200, height: 40 },
          { id: 't-bg-c', name: '#Content', type: 'TEXT', characters: '旧背景', width: 800, height: 90 }
        ]
      },
      {
        id: 't-core',
        name: '核心交互',
        type: 'FRAME',
        width: 1200,
        height: 140,
        children: [
          { id: 't-core-h', name: '#Title', type: 'TEXT', characters: '2.核心交互', width: 200, height: 40 },
          { id: 't-core-c', name: '#Content', type: 'TEXT', characters: '旧交互', width: 800, height: 90 }
        ]
      }
    ]
  };
}

function chapterSpec(): PNodeSpec {
  return {
    id: 'c-root',
    name: '章节',
    type: 'COMPONENT',
    width: 2209,
    height: 1200,
    children: [
      { id: 'c-name', name: '#Name', type: 'TEXT', characters: '旧章节', width: 300, height: 70 },
      {
        id: 'c-rec',
        name: 'rec组',
        type: 'FRAME',
        width: 1920,
        height: 1080,
        children: [
          { id: 'c-img', name: '主图占位', type: 'RECTANGLE', width: 1920, height: 1080, fills: ['IMAGE:old'] },
          { id: 'c-hint', name: '主图占位文案', type: 'TEXT', characters: '主图占位 待手动替换', width: 900, height: 90 },
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
          }
        ]
      },
      {
        id: 'c-col',
        name: 'Text',
        type: 'FRAME',
        width: 1200,
        height: 600,
        children: [
          {
            id: 'c-old1',
            name: '说明块01',
            type: 'FRAME',
            width: 1200,
            height: 300,
            children: [{ id: 'c-old1-t', name: '正文/规则', type: 'TEXT', characters: '上一份文档的残留内容', width: 900, height: 44 }]
          },
          {
            id: 'c-old2',
            name: '说明块02',
            type: 'FRAME',
            width: 1200,
            height: 300,
            children: [{ id: 'c-old2-t', name: '正文/规则', type: 'TEXT', characters: '上一份文档的残留内容二', width: 900, height: 44 }]
          }
        ]
      }
    ]
  };
}

function clusterSpec(): PNodeSpec {
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
      {
        id: 'k-roles',
        name: '职能标记',
        type: 'FRAME',
        width: 400,
        height: 40,
        children: [
          { id: 'k-r1', name: '@GUI', type: 'TEXT', characters: '@GUI', width: 80, height: 36 },
          { id: 'k-r2', name: '@程序', type: 'TEXT', characters: '@程序', width: 80, height: 36 },
          { id: 'k-r3', name: '@美术', type: 'TEXT', characters: '@美术', width: 80, height: 36 }
        ]
      },
      { id: 'k-b1', name: '正文/规则', type: 'TEXT', characters: '旧内容一', width: 900, height: 44 },
      { id: 'k-b2', name: '正文/规则', type: 'TEXT', characters: '旧内容二', width: 900, height: 44 },
      {
        id: 'k-fig',
        name: '配图',
        type: 'GROUP',
        width: 400,
        height: 300,
        children: [
          { id: 'k-fig-rect', name: '配图占位', type: 'RECTANGLE', width: 400, height: 300 },
          { id: 'k-fig-hint', name: '配图占位文案', type: 'TEXT', characters: '配图占位：待手动替换', width: 300, height: 40 }
        ]
      }
    ]
  };
}

function footerSpec(): PNodeSpec {
  return {
    id: 'f-root',
    name: '结尾',
    type: 'COMPONENT',
    width: 1920,
    height: 200,
    children: [{ id: 'f-text', name: 'end', type: 'TEXT', characters: 'the end.', width: 200, height: 60 }]
  };
}

function makePack(overrides: Record<string, string> = {}) {
  const parsed = parseTemplatePack({
    schema_version: 1,
    project: '测试项目',
    components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster', footer: 'k-footer' },
    capabilities: {
      overview: 'two-frames',
      clusterGroups: 'slot-run',
      badgeSlot: 'container',
      numberBadge: 'text',
      roleAnnotation: 'component-variant',
      figure: 'named-group',
      hiddenPool: 'ignore',
      column: 'right',
      ...overrides
    }
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.pack;
}

function setup(md = MD, overrides: Record<string, string> = {}) {
  const parsed = parseV2(md);
  if (!parsed.ir) throw new Error(parsed.errors.map((e) => e.message).join('; '));
  const h = partsBackend({
    id: 'page-root',
    name: 'Page',
    type: 'PAGE',
    width: 4000,
    height: 4000
  });
  h.registerComponent('k-top', topSpec());
  h.registerComponent('k-chapter', chapterSpec());
  h.registerComponent('k-cluster', clusterSpec());
  h.registerComponent('k-footer', footerSpec());
  return { h, ir: parsed.ir, pack: makePack(overrides) };
}

describe('renderFromParts', () => {
  it('两章两簇：拼装、清空原稿、摆标号', async () => {
    const { h, ir, pack } = setup();
    const r = await renderFromParts({
      ir,
      pack,
      pageId: 'page-root',
      backend: h.backend
    });

    expect(r.rootId).toBeTruthy();
    // 根帧高度按内容撑开，且三个顶层部件不重叠
    const root = h.nodes.get(r.rootId)!;
    expect(root.height).toBeGreaterThan(320);

    const chapters = h.nodes.get(r.rootId)!.children
      .map((id) => h.nodes.get(id)!)
      .filter((n) => n.name.startsWith('界面说明'));
    expect(chapters).toHaveLength(2);

    // 章节标题被写成本次文档的界面名
    expect(h.byName(r.rootId, '#Name').map((n) => n.characters)).toEqual(['设置面板', '背包面板']);

    // 每章的簇容器 = 本次的簇数量（原稿的两块残留被清空）
    for (const chapter of chapters) {
      const col = h.byName(chapter.id, 'Text')[0]!;
      expect(col.children).toHaveLength(1);
    }

    // 标号：每章一个（本章 1 簇），编号 1 起，母版仍在且隐藏
    const containers = h.byName(r.rootId, '气泡');
    expect(containers).toHaveLength(2);
    const numbers = containers
      .flatMap((c) => h.childrenOf(c.id))
      .filter((b) => b.visible !== false)
      .map((b) => h.childrenOf(b.id).find((c2) => c2.name === '#Number')?.characters);
    expect(numbers.sort()).toEqual(['1', '1']);
    expect(h.nodes.get(h.byName(r.rootId, BADGE_MASTER_NAME)[0]!.id)!.visible).toBe(false);

    // 原稿残留不再出现
    expect(h.byName(r.rootId, '说明块01')).toHaveLength(0);
    expect(h.byName(r.rootId, '上一份文档的残留内容')).toHaveLength(0);
  });

  it('章节主图无资产时清空原稿填充', async () => {
    const { h, ir, pack } = setup();
    await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });
    const images = h.byName(h.root().id, '主图占位').filter((n) => n.type === 'RECTANGLE');
    expect(images.every((n) => (n.fills ?? []).length === 0)).toBe(true);
  });

  it('badgeSlot=manual 只告警不摆标号', async () => {
    const { h, ir, pack } = setup(MD, { badgeSlot: 'manual' });
    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });
    expect(r.warnings.some((w) => w.code === 'V2_W_BADGE_UNPLACED')).toBe(true);
    const container = h.byName(r.rootId, '气泡')[0]!;
    expect(h.childrenOf(container.id)).toHaveLength(1); // 只剩母版
  });

  it('overview=none 且 md 有总览 → 省略并告警，不拒绝', async () => {
    const { h, ir, pack } = setup(MD, { overview: 'none' });
    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });
    expect(r.warnings.some((w) => w.code === 'V2_W_OVERVIEW_SLOTS_MISSING')).toBe(true);
    expect(h.byName(r.rootId, '界面说明1')).toHaveLength(1);
  });

  it('clusterGroups=none 但 md 用了 #### → 拒绝', async () => {
    const md = MD.replace(
      '@GUI @程序\n\n- 点击入口\n- 面板弹出',
      '@GUI @程序\n\n- 点击入口\n\n#### 分组一\n\n- 面板弹出'
    );
    const { h, ir, pack } = setup(md, { clusterGroups: 'none' });
    await expect(
      renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend })
    ).rejects.toMatchObject({ code: PARTS_RENDER_CODES.SUBGROUP_UNSUPPORTED });
  });

  it('roleAnnotation=inline-suffix 时删掉簇里的职能标记帧', async () => {
    const { h, ir, pack } = setup(MD, { roleAnnotation: 'inline-suffix' });
    await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });
    expect(h.byName(h.byName(h.root().id, '界面说明1')[0]!.id, '职能标记')).toHaveLength(0);
  });

  it('numberBadge=none 时不写簇编号', async () => {
    const { h, ir, pack } = setup(MD, { numberBadge: 'none' });
    await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });
    const chapter = h.byName(h.root().id, '界面说明1')[0]!;
    expect(h.byName(chapter.id, 'Number')).toHaveLength(0);
  });

  it('column=bottom 不影响拼装', async () => {
    const { h, ir, pack } = setup(MD, { column: 'bottom' });
    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });
    expect(h.byName(r.rootId, '界面说明1')).toHaveLength(1);
    expect(h.byName(r.rootId, '界面说明2')).toHaveLength(1);
  });

  it('md 没写配图时，模板自带的配图槽被整组隐藏', async () => {
    const { h, ir, pack } = setup();
    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const slots = h.byName(r.rootId, '配图');
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((n) => n.visible === false)).toBe(true);
  });

  it('声明了配图但 assetMap 没给 → 逐条告警 + 计入 figuresPlaceholder', async () => {
    const md = MD.replace('- 面板弹出', '- 面板弹出\n\n配图：待机动作');
    const { h, ir, pack } = setup(md);
    const r = await renderFromParts({ ir, pack, pageId: 'page-root', backend: h.backend });

    const warnings = r.warnings.filter((w) => w.code === 'V2_W_FIGURE_ASSET_MISSING');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('01/1/1');
    expect(r.summary.figuresPlaceholder).toBe(1);
    expect(r.summary.figuresPlaced).toBe(0);
  });

  it('模板里多出来的配图槽（条目数对不上）也要被隐藏', async () => {
    // md 只声明 1 张，模板簇自带 1 个槽 → 全用上；再造一个残留槽验证兜底。
    const md = MD.replace('- 面板弹出', '- 面板弹出\n\n配图：待机动作');
    const { h, ir, pack } = setup(md);
    const spec = clusterSpec();
    spec.children!.push({
      id: 'k-fig2',
      name: '配图',
      type: 'GROUP',
      width: 400,
      height: 300,
      children: [
        { id: 'k-fig2-rect', name: '配图占位', type: 'RECTANGLE', width: 400, height: 300 },
        { id: 'k-fig2-hint', name: '配图占位文案', type: 'TEXT', characters: '配图占位：待手动替换', width: 300, height: 40 }
      ]
    });
    h.registerComponent('k-cluster', spec);

    const r = await renderFromParts({
      ir,
      pack,
      pageId: 'page-root',
      backend: h.backend
    });

    const hidden = h
      .byName(r.rootId, '配图')
      .filter((n) => n.visible === false);
    expect(hidden.length).toBeGreaterThan(0);
  });
});
