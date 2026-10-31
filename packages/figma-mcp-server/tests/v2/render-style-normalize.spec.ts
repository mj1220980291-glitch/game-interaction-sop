/**
 * 写入层的样式归一化。
 *
 * 真机（M1/M2，2026-10-30）：模板的 `正文/规则` 是 CENTER，克隆继承后 102 条正文
 * 全部居中；`主图占位` 带 `dashPattern: [12,12]`，填图只换 fill，虚线压在截图上。
 *
 * Spec: template-render「写入层的样式归一化」/「置图清描边」
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { makeBackend, type NodeStore } from './helpers/mock-backend.js';
import type { FigmaBackend, NodeInfo } from '../../src/v2/figma-client.js';

const MD = `# 样式归一化

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

- 第一条规则
- 第二条规则
- 第三条规则
`;

function nodesNamed(store: NodeStore, name: string): Array<NodeStore[string]> {
  return Object.values(store).filter((n) => n.name === name);
}

describe('正文层样式归一化', () => {
  it('模板正文为 CENTER 时，写入后全部 LEFT 且自适应 HEIGHT', async () => {
    const m = makeBackend();
    // 模板自带的正文载体是克隆源，把它设成真机那样的居中。
    const protos = nodesNamed(m.store, '正文/规则');
    expect(protos.length).toBeGreaterThan(0);
    for (const p of protos) (p as { textAlignHorizontal?: string }).textAlignHorizontal = 'CENTER';

    const r = await renderV2MarkdownToFigma({ markdown: MD }, m.backend);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);

    const bodies = nodesNamed(m.store, '正文/规则').filter((n) =>
      ['第一条规则', '第二条规则', '第三条规则'].includes((n as NodeInfo).characters ?? '')
    );
    expect(bodies.length).toBeGreaterThanOrEqual(3);
    for (const b of bodies) {
      expect((b as { textAlignHorizontal?: string }).textAlignHorizontal).toBe('LEFT');
      expect((b as { textAutoResize?: string }).textAutoResize).toBe('HEIGHT');
    }
  });

  it('归一化只报一条聚合告警', async () => {
    const m = makeBackend();
    for (const p of nodesNamed(m.store, '正文/规则')) {
      (p as { textAlignHorizontal?: string }).textAlignHorizontal = 'CENTER';
    }

    const r = await renderV2MarkdownToFigma({ markdown: MD }, m.backend);
    const align = r.warnings.filter((w) => w.code === 'V2_W_TEXT_ALIGN_NORMALIZED');
    expect(align).toHaveLength(1);
    expect(align[0]?.message).toMatch(/\d+ 条/);
  });

  it('模板本来就是 LEFT 时不产生告警', async () => {
    const m = makeBackend();
    const r = await renderV2MarkdownToFigma({ markdown: MD }, m.backend);
    expect(r.warnings.some((w) => w.code === 'V2_W_TEXT_ALIGN_NORMALIZED')).toBe(false);
  });
});

describe('置图清描边', () => {
  it('主图填图后清掉模板的虚线描边', async () => {
    const m = makeBackend();
    m.addSource('src-1', 600, 300);
    const cleared: string[] = [];
    const spied: FigmaBackend = {
      ...m.backend,
      clearStrokes: async (ids) => {
        cleared.push(...ids);
      }
    };

    const r = await renderV2MarkdownToFigma(
      {
        markdown: MD,
        assetMap: { '01': { type: 'figma_node', fileKey: 'f', nodeId: 'src-1' } }
      },
      spied
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    const mains = nodesNamed(m.store, '主图占位').map((n) => n.id);
    expect(mains.length).toBeGreaterThan(0);
    // 模板自带的原件 + 本次克隆的那一份都要清，断言「至少命中了产物里的主图」。
    expect(cleared.some((id) => mains.includes(id))).toBe(true);
  });

  it('不传主图资产时不清描边（占位虚线是有意保留的）', async () => {
    const m = makeBackend();
    const cleared: string[] = [];
    const spied: FigmaBackend = {
      ...m.backend,
      clearStrokes: async (ids) => {
        cleared.push(...ids);
      }
    };

    const r = await renderV2MarkdownToFigma({ markdown: MD }, spied);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(cleared).toHaveLength(0);
  });
});
