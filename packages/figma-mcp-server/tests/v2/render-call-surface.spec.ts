/**
 * 渲染调用面：落点、瞬时重试、报错瘦身。
 *
 * 真机（M1/M2，2026-10-30）：新文档固定落 (0,0) 压设计稿，每次手工挪；
 * `figma_get_status` 说已连接、render 报 `Cannot connect`，第三次才成；
 * 报错 message 里塞整段节点 dump。
 *
 * Spec: template-render「文档落点」/「创建路径瞬时重试」
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { makeBackend } from './helpers/mock-backend.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';

const MD = `# 落点

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.10.31

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。

## 01. 战斗界面

### 血条
@GUI

- a
`;

/** 一个独立页面 + 两个既有节点，模拟设计稿占位。 */
function pageBackend() {
  const m = makeBackend();
  const pageId = 'page-1';
  m.store[pageId] = {
    id: pageId,
    name: 'Page 1',
    type: 'PAGE',
    children: [],
    absoluteBoundingBox: { x: 0, y: 0, width: 4000, height: 4000 }
  };
  m.store['page-block-a'] = {
    id: 'page-block-a',
    name: '设计稿A',
    type: 'FRAME',
    parentId: pageId,
    children: [],
    absoluteBoundingBox: { x: 100, y: 0, width: 1200, height: 800 }
  };
  m.store['page-block-b'] = {
    id: 'page-block-b',
    name: '设计稿B',
    type: 'FRAME',
    parentId: pageId,
    children: [],
    absoluteBoundingBox: { x: 1400, y: 900, width: 1000, height: 600 }
  };
  m.store[pageId]!.children.push('page-block-a', 'page-block-b');
  return { m, pageId };
}

describe('文档落点', () => {
  it('传 position 时根帧落在该坐标', async () => {
    const { m, pageId } = pageBackend();
    const r = await renderV2MarkdownToFigma(
      { markdown: MD, target: { pageId }, position: { x: 0, y: 3300 } },
      m.backend
    );
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const box = m.store[r.rootInstanceId!]!.absoluteBoundingBox!;
    expect([box.x, box.y]).toEqual([0, 3300]);
  });

  it('autoPlace=below 落在页面最下沿 + gap', async () => {
    const { m, pageId } = pageBackend();
    const r = await renderV2MarkdownToFigma(
      { markdown: MD, target: { pageId }, autoPlace: 'below' },
      m.backend
    );
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const box = m.store[r.rootInstanceId!]!.absoluteBoundingBox!;
    // 页面最下沿 = 900 + 600 = 1500，默认 gap 100。
    expect(box.y).toBe(1600);
    expect(box.x).toBe(100); // 与最宽的子节点左边对齐
  });

  it('position 与 autoPlace 同时给时以 position 为准并告警', async () => {
    const { m, pageId } = pageBackend();
    const r = await renderV2MarkdownToFigma(
      {
        markdown: MD,
        target: { pageId },
        position: { x: 7, y: 9 },
        autoPlace: 'right'
      },
      m.backend
    );
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const box = m.store[r.rootInstanceId!]!.absoluteBoundingBox!;
    expect([box.x, box.y]).toEqual([7, 9]);
    expect(r.warnings.some((w) => w.code === 'V2_W_POSITION_OVERRIDE')).toBe(true);
  });

  it('autoPlace 没有 pageId 时回落 (0,0) 并告警', async () => {
    const { m } = pageBackend();
    const r = await renderV2MarkdownToFigma({ markdown: MD, autoPlace: 'below' }, m.backend);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings.some((w) => w.code === 'V2_W_AUTOPLACE_FALLBACK')).toBe(true);
  });
});

describe('创建路径瞬时重试', () => {
  it('首轮连接失败后整轮回滚并重试成功', async () => {
    const m = makeBackend();
    let calls = 0;
    const flaky: FigmaBackend = {
      ...m.backend,
      async commitUndoCheckpoint(label) {
        calls += 1;
        if (calls === 1) {
          throw new Error('figma_execute failed: Unable to establish connection to Figma after 10 seconds');
        }
        return m.backend.commitUndoCheckpoint!(label);
      }
    };

    const r = await renderV2MarkdownToFigma(
      { markdown: MD, retry: { sleep: async () => {} } },
      flaky
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(calls).toBe(2);
    expect(r.warnings.some((w) => w.code === 'V2_W_RENDER_RETRIED')).toBe(true);
  });

  it('非瞬时错误不重试', async () => {
    const m = makeBackend();
    let calls = 0;
    const broken: FigmaBackend = {
      ...m.backend,
      async commitUndoCheckpoint() {
        calls += 1;
        throw Object.assign(new Error('模板包未命中'), { code: 'V2_TEMPLATE_PACK_MISSING' });
      }
    };

    const r = await renderV2MarkdownToFigma(
      { markdown: MD, retry: { sleep: async () => {} } },
      broken
    );

    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('V2_TEMPLATE_PACK_MISSING');
    expect(calls).toBe(1);
  });
});

describe('报错瘦身', () => {
  it('超长多行报错只留一行 message，其余进 details', async () => {
    const m = makeBackend();
    const dump = `渲染失败：节点清单\n${Array.from({ length: 40 }, (_, i) => `- 节点 ${i} name="配图"`).join('\n')}`;
    const broken: FigmaBackend = {
      ...m.backend,
      async commitUndoCheckpoint() {
        throw new Error(dump);
      }
    };

    const r = await renderV2MarkdownToFigma({ markdown: MD }, broken);

    expect(r.ok).toBe(false);
    const err = r.errors[0] as { message: string; details?: string };
    expect(err.message).toBe('渲染失败：节点清单');
    expect(err.details).toContain('节点 39');
  });
});
