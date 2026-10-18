/**
 * 配图按 bullet 原位渲染且一簇多张。
 *
 * 说明块（或 `####` 槽位段）内 `正文/规则` 与 `配图` 的堆叠顺序必须等于 Markdown
 * bullet 顺序；每条 `配图：` 一个 GROUP，描述各自写入。
 *
 * 无配图文档的调用序列回归由 render-subgroups.spec.ts 的 BASELINE 断言覆盖。
 *
 * Change: openspec/changes/engine-inline-multi-figure
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { makeBackend, collectByName, type NodeStore } from './helpers/mock-backend.js';

const HEAD = `# 原位配图

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.10.16

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。
`;

function doc(body: string): string {
  return `${HEAD}\n${body}`.trim();
}

function blocks(store: NodeStore, rootId: string) {
  const rightCol = collectByName(store, rootId, 'Text')[0];
  if (!rightCol) throw new Error('rendered doc has no right column');
  return rightCol.children
    .map((id) => store[id]!)
    .filter((n) => n.name.startsWith('说明块'));
}

/**
 * 说明块直接子节点里正文与配图的相对顺序。配图用其占位文案表示，
 * 其余节点（标题 / #Title / 角色框）按需保留以便断言槽位边界。
 */
function contentOrder(
  store: NodeStore,
  blockId: string,
  opts: { keepTitles?: boolean } = {}
): string[] {
  const out: string[] = [];
  for (const id of store[blockId]?.children ?? []) {
    const n = store[id]!;
    if (n.name === '正文/规则') out.push(`正文="${n.characters ?? ''}"`);
    else if (n.name === '配图') {
      const hint = collectByName(store, n.id, '配图占位文案')[0];
      out.push(`配图(${hint?.characters ?? ''})`);
    } else if (opts.keepTitles && n.name === '#Title') {
      out.push(`#Title="${n.characters ?? ''}"`);
    }
  }
  return out;
}

async function render(markdown: string) {
  const { backend, store } = makeBackend();
  const result = await renderV2MarkdownToFigma({ markdown }, backend);
  expect(result.ok, JSON.stringify(result.errors)).toBe(true);
  return { store, bs: blocks(store, result.rootInstanceId!), rootId: result.rootInstanceId! };
}

describe('配图按 bullet 原位渲染且一簇多张', () => {
  it('扁平簇多图：正文与配图按 bullet 顺序穿插', async () => {
    const { store, bs } = await render(
      doc(`## 01. 战斗界面

### 阶段与倒计时
@GUI

- a
- 配图：A图
- b
- c
- 配图：C图
`)
    );

    expect(contentOrder(store, bs[0]!.id)).toEqual([
      '正文="a"',
      '配图(配图占位：A图)',
      '正文="b"',
      '正文="c"',
      '配图(配图占位：C图)'
    ]);
  });

  it('扁平簇单图在末尾：配图落在最后一条正文之后', async () => {
    const { store, bs } = await render(
      doc(`## 01. 战斗界面

### 经验条
@GUI

- a
- b
- c
- 配图：X
`)
    );

    expect(contentOrder(store, bs[0]!.id)).toEqual([
      '正文="a"',
      '正文="b"',
      '正文="c"',
      '配图(配图占位：X)'
    ]);
  });

  it('扁平簇以配图开头：配图在第一条正文之前', async () => {
    const { store, bs } = await render(
      doc(`## 01. 战斗界面

### 经验条
@GUI

- 配图：总览
- a
`)
    );

    expect(contentOrder(store, bs[0]!.id)).toEqual(['配图(配图占位：总览)', '正文="a"']);
  });

  it('#### 槽位段内多图：按段内 bullet 顺序穿插', async () => {
    const { store, bs } = await render(
      doc(`## 01. 战斗界面

### 经验条
@GUI

#### 基础
- a

#### 反馈
- b
- 配图：B1
- c
- 配图：B2
`)
    );

    expect(contentOrder(store, bs[0]!.id, { keepTitles: true })).toEqual([
      '#Title="基础"',
      '正文="a"',
      '#Title="反馈"',
      '正文="b"',
      '配图(配图占位：B1)',
      '正文="c"',
      '配图(配图占位：B2)'
    ]);
  });

  it('多图簇落在无配图的 说明块02：从种子克隆，前簇不残留', async () => {
    const { store, bs, rootId } = await render(
      doc(`## 01. 战斗界面

### 血条
@GUI

- h

### 地图卡片
@GUI

- 默认状态
- 配图：默认态
- 选中状态：点击卡片后进入
- 配图：选中态
`)
    );

    expect(bs).toHaveLength(2);
    expect(collectByName(store, bs[0]!.id, '配图')).toHaveLength(0);
    expect(contentOrder(store, bs[1]!.id)).toEqual([
      '正文="默认状态"',
      '配图(配图占位：默认态)',
      '正文="选中状态：点击卡片后进入"',
      '配图(配图占位：选中态)'
    ]);
    // 种子已在章节结束时 flush，全篇配图数 = 声明数。
    expect(collectByName(store, rootId, '配图')).toHaveLength(2);
  });

  it('每个配图的占位文案各自写入，不串用首条描述', async () => {
    const { store, bs } = await render(
      doc(`## 01. 战斗界面

### 地图卡片
@GUI

- s1
- 配图：一
- s2
- 配图：二
- s3
- 配图：三
`)
    );

    const hints = collectByName(store, bs[0]!.id, '配图占位文案').map((n) => n.characters);
    expect(hints).toEqual(['配图占位：一', '配图占位：二', '配图占位：三']);
  });
});
