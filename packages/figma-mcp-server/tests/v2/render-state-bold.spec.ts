/**
 * 状态行状态名加粗 — render 侧。
 *
 * Spec: figma-template-1-14-rendering「状态行状态名加粗」
 * Change: openspec/changes/cluster-order-and-state-block
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { SOFT_WARNING_CODES } from '../../src/v2/ir.js';
import { makeBackend, collectByName, MOCK_FONT_FAMILY, type NodeStore } from './helpers/mock-backend.js';

const HEAD = `# 状态加粗

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.10.17

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。
`;

type BoldNode = NodeStore[string] & { bold?: number };

/** `正文/规则` TEXTs under the doc as `[characters, bold]`, in tree order. */
function bulletWeights(store: NodeStore, rootId: string): Array<[string, number | undefined]> {
  return collectByName(store, rootId, '正文/规则').map((n) => [
    n.characters ?? '',
    (n as BoldNode).bold
  ]);
}

async function render(body: string, opts: { noBold?: boolean } = {}) {
  const mock = makeBackend();
  mock.faults.noBold = opts.noBold;
  const result = await renderV2MarkdownToFigma({ markdown: `${HEAD}\n${body}`.trim() }, mock.backend);
  expect(result.ok, JSON.stringify(result.errors)).toBe(true);
  return { store: mock.store, rootId: result.rootInstanceId!, result };
}

describe('状态行状态名加粗', () => {
  it('无配图扁平路径：状态行带状态名长度，普通规则为 0', async () => {
    const { store, rootId } = await render(`## 01. 选图界面

### 地图卡片
@GUI

- 点击卡片选中该地图
- 默认状态
- 选中状态：点击卡片后进入
`);
    expect(bulletWeights(store, rootId)).toEqual([
      ['点击卡片选中该地图', 0],
      ['默认状态', 4],
      ['选中状态：点击卡片后进入', 4]
    ]);
  });

  it('原位配图路径同样加粗', async () => {
    const { store, rootId } = await render(`## 01. 选图界面

### 地图卡片
@GUI

- 冷却状态：技能释放后进入
- 配图：冷却态
- 释放时播放音效
`);
    expect(bulletWeights(store, rootId)).toEqual([
      ['冷却状态：技能释放后进入', 4],
      ['释放时播放音效', 0]
    ]);
  });

  it('#### 分组路径同样加粗，子标题不带 bold', async () => {
    const { store, rootId } = await render(`## 01. 选图界面

### 地图卡片
@GUI

#### 选择
- 点击卡片选中该地图

#### 状态
- 锁定状态：未解锁该地图时
`);
    expect(bulletWeights(store, rootId)).toEqual([
      ['点击卡片选中该地图', 0],
      ['锁定状态：未解锁该地图时', 4]
    ]);
    for (const t of collectByName(store, rootId, '#Title')) {
      expect((t as BoldNode).bold).toBeUndefined();
    }
  });

  it('文件头等非 bullet 文字不带 bold', async () => {
    const { store, rootId } = await render(`## 01. 选图界面

### 地图卡片
@GUI

- 默认状态
`);
    const title = collectByName(store, rootId, '文档标题')[0] as BoldNode | undefined;
    expect(title?.characters).toBe('状态加粗');
    expect(title?.bold).toBeUndefined();
  });

  it('字体族无粗体时照常渲染，并给出一条警告', async () => {
    const { result } = await render(
      `## 01. 选图界面

### 地图卡片
@GUI

- 默认状态
- 选中状态：点击后

### 技能按钮
@GUI

- 冷却状态
- 配图：冷却态
`,
      { noBold: true }
    );
    const w = result.warnings.filter((x) => x.code === SOFT_WARNING_CODES.W_STATE_BOLD_UNAVAILABLE);
    expect(w).toHaveLength(1);
    expect(w[0]!.context).toBe(MOCK_FONT_FAMILY);
  });
});
