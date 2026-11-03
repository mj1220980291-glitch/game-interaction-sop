/**
 * 模板声明 `roleAnnotation: 'inline-suffix'`（把职能拼进标题）时，引擎尚未实现。
 *
 * 以前是静默：md 里的 `@GUI @程序` 直接消失，文档里搜不到任何角色，也没有一条告警
 * （真机 2026-11-03：蛋仔包的「进入提示」簇）。
 *
 * Spec: template-render（能力声明与实现不一致必须告警）
 */

import { describe, it, expect } from 'vitest';
import { parseV2 } from '../../src/v2/parser.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { renderFromParts } from '../../src/v2/render/parts/index.js';
import { SOFT_WARNING_CODES } from '../../src/v2/ir.js';
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
      { id: 'k-b1', name: '正文/规则', type: 'TEXT', characters: '旧内容', width: 900, height: 44 }
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

describe('roleAnnotation: inline-suffix', () => {
  it('职能条目没写进文档时给出可读告警，不静默', async () => {
    const parsed = parseV2(MD);
    const h = partsBackend({ id: 'page', name: 'Page', type: 'PAGE' });
    h.registerComponent('k-top', top());
    h.registerComponent('k-chapter', chapter());
    h.registerComponent('k-cluster', cluster());

    const r = await renderFromParts({
      ir: parsed.ir!,
      pack: pack('inline-suffix'),
      pageId: 'page',
      backend: h.backend
    });

    const warns = r.warnings.filter(
      (w) => w.code === SOFT_WARNING_CODES.W_ROLE_ANNOTATION_UNSUPPORTED
    );
    expect(warns).toHaveLength(1);
    expect(warns[0]!.message).toContain('GUI');
    expect(warns[0]!.message).toContain('程序');
    expect(warns[0]!.message).toContain('inline-suffix');
  });

  it('component-variant 包不产生这条告警', async () => {
    const parsed = parseV2(MD);
    const h = partsBackend({ id: 'page', name: 'Page', type: 'PAGE' });
    h.registerComponent('k-top', top());
    h.registerComponent('k-chapter', chapter());
    h.registerComponent('k-cluster', cluster());

    const r = await renderFromParts({
      ir: parsed.ir!,
      pack: pack('component-variant'),
      pageId: 'page',
      backend: h.backend
    });

    expect(
      r.warnings.some((w) => w.code === SOFT_WARNING_CODES.W_ROLE_ANNOTATION_UNSUPPORTED)
    ).toBe(false);
  });
});
