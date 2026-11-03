/**
 * `roleAnnotation: 'inline-suffix'`：职能拼在正文句尾，并给 `@GUI` 上色。
 *
 * 蛋仔这类模板没有「职能标记」组件位，职能以 `@GUI @程序` 的形式跟在条目后面，
 * 在 Figma 里是带色的字。渲染把 md 整行写进同一个 TEXT 节点，所以拼装与上色都
 * 由引擎做；同步侧必须按同一份文本比对（`expectedItems({inlineRoles})`）。
 *
 * Spec: template-render「职能在 inline-suffix 模板上拼在正文句尾」
 */

import { describe, it, expect } from 'vitest';
import { parseV2 } from '../../src/v2/parser.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { renderFromParts } from '../../src/v2/render/parts/index.js';
import { ROLE_COLORS } from '../../src/v2/template-map.js';
import { expectedItems } from '../../src/v2/reconcile/layout.js';
import { withInlineRoleSuffix } from '../../src/v2/role-suffix.js';
import { partsBackend, type PNodeSpec } from './helpers/parts-backend.js';

const MD = `# 进入提示

跟进UI：a
需求组：b
易协作链接：#待补充
最后更新时间：2026.11.03

## 设计总览

### 功能背景

局内提示。

### 核心交互

进入房间时提示。

## 01. 进入房间

### 进入提示
@GUI @程序

- 玩家进入房间时显示提示
- 提示 3 秒后自动消失
`;

function top(): PNodeSpec {
  const header = (id: string, name: string): PNodeSpec => ({
    id,
    name,
    type: 'TEXT',
    characters: '旧',
    width: 300,
    height: 40
  });
  return {
    id: 't',
    name: '顶部',
    type: 'COMPONENT',
    width: 1920,
    height: 320,
    children: [
      header('t-title', '文档标题'),
      header('t-owner', '设计师名称'),
      header('t-group', '需求组名称'),
      header('t-ticket', '易协作单号链接'),
      header('t-updated', '更新时间')
    ]
  };
}

function chapter(): PNodeSpec {
  return {
    id: 'ch',
    name: '章节',
    type: 'COMPONENT',
    width: 3382,
    height: 1600,
    layoutMode: 'HORIZONTAL',
    children: [
      { id: 'ch-name', name: '#Name', type: 'TEXT', characters: '旧章', width: 400, height: 60 },
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
            children: [{ id: 'ch-master-n', name: '#Number', type: 'TEXT', characters: '0', width: 40, height: 40 }]
          }
        ]
      },
      { id: 'ch-col', name: 'Text', type: 'FRAME', width: 1200, height: 1200, layoutMode: 'VERTICAL', children: [] }
    ]
  };
}

function cluster(): PNodeSpec {
  return {
    id: 'k',
    name: '簇',
    type: 'COMPONENT',
    width: 1200,
    height: 600,
    children: [
      { id: 'k-num', name: 'Number', type: 'TEXT', characters: '9', width: 40, height: 40 },
      { id: 'k-title', name: '#Title_Main', type: 'TEXT', characters: '旧簇', width: 300, height: 50 },
      { id: 'k-b1', name: '正文/规则', type: 'TEXT', characters: '旧内容', width: 900, height: 44 },
      { id: 'k-b2', name: '正文/规则', type: 'TEXT', characters: '旧内容二', width: 900, height: 44 }
    ]
  };
}

function pack(roleAnnotation: 'inline-suffix' | 'component-variant') {
  const parsed = parseTemplatePack({
    schema_version: 1,
    project: '蛋仔',
    components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster' },
    capabilities: {
      overview: 'two-frames',
      clusterGroups: 'none',
      badgeSlot: 'container',
      numberBadge: 'text',
      roleAnnotation,
      figure: 'none',
      hiddenPool: 'ignore',
      column: 'right'
    }
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.pack;
}

function setup(roleAnnotation: 'inline-suffix' | 'component-variant') {
  const parsed = parseV2(MD);
  const h = partsBackend({ id: 'page', name: 'Page', type: 'PAGE' });
  h.registerComponent('k-top', top());
  h.registerComponent('k-chapter', chapter());
  h.registerComponent('k-cluster', cluster());
  return { h, ir: parsed.ir!, pack: pack(roleAnnotation) };
}

describe('withInlineRoleSuffix', () => {
  it('拼在第一条普通正文句尾，后面的条目不动', () => {
    const cluster = parseV2(MD).ir!.sections[0]!.clusters[0]!;
    const out = withInlineRoleSuffix(cluster);
    expect(out.bullets[0]).toBe('玩家进入房间时显示提示 @GUI @程序');
    expect(out.bullets[1]).toBe('提示 3 秒后自动消失');
    expect(out.groups[0]!.bullets).toEqual(out.bullets);
  });

  it('没有职能时原样返回（同一个对象）', () => {
    const cluster = parseV2(MD).ir!.sections[0]!.clusters[0]!;
    const bare = { ...cluster, roles: [] };
    expect(withInlineRoleSuffix(bare)).toBe(bare);
  });
});

describe('renderFromParts —— inline-suffix', () => {
  it('职能拼进正文句尾并上色', async () => {
    const { h, ir, pack: p } = setup('inline-suffix');
    const r = await renderFromParts({ ir, pack: p, pageId: 'page', backend: h.backend });

    const bullets = h.byName(r.rootId, '正文/规则').map((n) => n.characters);
    expect(bullets[0]).toBe('玩家进入房间时显示提示 @GUI @程序');
    expect(bullets[1]).toBe('提示 3 秒后自动消失');

    const painted = [...h.rangeFills.entries()];
    const gui = painted.find(([, ranges]) => ranges.some((x) => x.color === ROLE_COLORS['@GUI']));
    expect(gui).toBeDefined();
    const text = h.nodes.get(gui![0])!.characters!;
    const range = gui![1].find((x) => x.color === ROLE_COLORS['@GUI'])!;
    expect(text.slice(range.start, range.end)).toBe('@GUI');

    // 实现之后不该再有「职能丢失」告警
    expect(r.warnings.map((w) => w.code)).not.toContain('V2_W_ROLE_ANNOTATION_UNSUPPORTED');
  });

  it('component-variant 包不拼句尾', async () => {
    const { h, ir, pack: p } = setup('component-variant');
    const r = await renderFromParts({ ir, pack: p, pageId: 'page', backend: h.backend });
    const bullets = h.byName(r.rootId, '正文/规则').map((n) => n.characters);
    expect(bullets[0]).toBe('玩家进入房间时显示提示');
  });
});

describe('expectedItems —— 同步侧同口径', () => {
  const cluster = () => parseV2(MD).ir!.sections[0]!.clusters[0]!;

  it('inlineRoles 时首条正文带后缀', () => {
    const items = expectedItems(cluster(), {
      includeRoles: false,
      includeSubtitles: false,
      inlineRoles: true
    });
    expect(items.map((i) => i.text)).toEqual([
      '玩家进入房间时显示提示 @GUI @程序',
      '提示 3 秒后自动消失'
    ]);
  });

  it('不开 inlineRoles 时不带后缀', () => {
    const items = expectedItems(cluster(), { includeRoles: false, includeSubtitles: false });
    expect(items[0]!.text).toBe('玩家进入房间时显示提示');
  });
});
