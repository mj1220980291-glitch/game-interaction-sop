/**
 * `####` 簇内子分类小标题 — render 侧。
 *
 * 覆盖 spec `figma-template-1-14-rendering` →「簇内子分类小标题渲染」的
 * 全部 Scenario，外加不含 `####` 文档的调用序列回归。
 *
 * Change: openspec/changes/port-subgroup-headings-to-mcp-server
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import {
  makeBackend,
  collectByName,
  type NodeStore
} from './helpers/mock-backend.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';

const HEAD = `# 子分组渲染

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.05.28

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。
`;

function doc(body: string): string {
  return `${HEAD}\n${body}`.trim();
}

/**
 * 渲染产物里的所有 说明块，按创建顺序（= AUTO_LAYOUT 视觉顺序）。
 * 必须以 rootInstanceId 为根：模板原件在 store 里还在，直接全局扫会多数出来。
 */
function blocks(store: NodeStore, rootId: string) {
  const out: NodeStore[string][] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const n = store[id];
    if (!n) continue;
    if (n.name.startsWith('说明块')) out.push(n);
    for (const c of n.children) queue.push(c);
  }
  return out;
}

/** 渲染产物里唯一的右栏容器。 */
function rightColumnOf(store: NodeStore, rootId: string): NodeStore[string] {
  const hit = collectByName(store, rootId, 'Text')[0];
  if (!hit) throw new Error('rendered doc has no right column');
  return hit;
}

/** 某个说明块内某个名字的所有 TEXT 的 characters。 */
function textsIn(store: NodeStore, blockId: string, name: string): string[] {
  return collectByName(store, blockId, name).map((n) => n.characters ?? '');
}

/** 记录每个 backend 方法的调用序列，用于逐字节回归比对。 */
function traced(backend: FigmaBackend): { backend: FigmaBackend; log: string[] } {
  const log: string[] = [];
  const wrapped = new Proxy(backend, {
    get(target, prop: string) {
      const orig = (target as unknown as Record<string, unknown>)[prop];
      if (typeof orig !== 'function') return orig;
      return (...args: unknown[]) => {
        log.push(prop);
        return (orig as (...a: unknown[]) => unknown).apply(target, args);
      };
    }
  });
  return { backend: wrapped as FigmaBackend, log };
}

describe('renderV2MarkdownToFigma — #### sub-groups', () => {
  it('single null-title group: no #Title survives, one block, unchanged shape', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI

- a
- b
`)
      },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    const bs = blocks(store, result.rootInstanceId!);
    expect(bs).toHaveLength(1);
    // 模板自带 2 个 #Title 占位，无 #### 时必须全删，否则"小标题1"泄漏
    expect(collectByName(store, bs[0]!.id, '#Title')).toHaveLength(0);
    expect(textsIn(store, bs[0]!.id, '正文/规则')).toEqual(['a', 'b']);
  });

  it('two groups get two blocks with their own headings and bullets', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI

#### 基础信息
- a

#### 升级反馈
- b
`)
      },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    const bs = blocks(store, result.rootInstanceId!);
    expect(bs).toHaveLength(2);

    expect(textsIn(store, bs[0]!.id, '#Title')).toEqual(['基础信息']);
    expect(textsIn(store, bs[0]!.id, '正文/规则')).toEqual(['a']);

    expect(textsIn(store, bs[1]!.id, '#Title')).toEqual(['升级反馈']);
    expect(textsIn(store, bs[1]!.id, '正文/规则')).toEqual(['b']);
  });

  it('role tags live only on the first block', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI

#### A
- a

#### B
- b

#### C
- c
`)
      },
      backend
    );

    const bs = blocks(store, result.rootInstanceId!);
    expect(bs).toHaveLength(3);

    const roleFrames = (blockId: string) =>
      Object.values(store).filter(
        (n) => n.name.startsWith('Frame 4273') && isUnder(store, n.id, blockId)
      );

    expect(roleFrames(bs[0]!.id).length).toBe(1);
    // 第 2..N 块整体删除角色标签 FRAME，而不只是删掉其中几个 TEXT
    expect(roleFrames(bs[1]!.id).length).toBe(0);
    expect(roleFrames(bs[2]!.id).length).toBe(0);
  });

  it('cluster-level identity (number badge + main title) is not repeated', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI

#### A
- a

#### B
- b
`)
      },
      backend
    );

    const bs = blocks(store, result.rootInstanceId!);
    expect(textsIn(store, bs[0]!.id, 'Number')).toEqual(['1']);
    expect(textsIn(store, bs[0]!.id, '#Title_Main')).toEqual(['经验条']);
    // 一个簇只有一个气泡，重复画编号会让读者以为有 3 个气泡
    expect(textsIn(store, bs[1]!.id, 'Number')).toEqual([]);
    expect(textsIn(store, bs[1]!.id, '#Title_Main')).toEqual([]);
  });

  it('配图占位 stays only on the group that declared 配图', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI

#### A
- a

#### B
- b
- 配图：升级特效示意
`)
      },
      backend
    );

    const bs = blocks(store, result.rootInstanceId!);
    expect(bs).toHaveLength(2);
    expect(collectByName(store, bs[0]!.id, '配图')).toHaveLength(0);
    expect(collectByName(store, bs[1]!.id, '配图')).toHaveLength(1);
    expect(textsIn(store, bs[1]!.id, '配图占位文案')).toEqual([
      '配图占位：升级特效示意'
    ]);
    // 配图 bullet 不占正文槽位
    expect(textsIn(store, bs[1]!.id, '正文/规则')).toEqual(['b']);
  });

  it('mixed free bullets + ####: the leading block has no heading', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI

- 游离

#### 基础信息
- a
`)
      },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    const bs = blocks(store, result.rootInstanceId!);
    expect(bs).toHaveLength(2);
    // 隐式分组没有标题，模板占位必须删掉而不是留下"小标题1"
    expect(collectByName(store, bs[0]!.id, '#Title')).toHaveLength(0);
    expect(textsIn(store, bs[0]!.id, '正文/规则')).toEqual(['游离']);
    expect(textsIn(store, bs[1]!.id, '#Title')).toEqual(['基础信息']);
  });

  it('group blocks of different clusters keep document order in the column', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI

#### A
- a1

#### B
- b1

### 血条
@GUI

- h1
`)
      },
      backend
    );

    const rightCol = rightColumnOf(store, result.rootInstanceId!);
    const order = rightCol.children.map((id) => {
      const b = store[id]!;
      const sub = textsIn(store, b.id, '#Title');
      const main = textsIn(store, b.id, '#Title_Main');
      return `${main[0] ?? '-'}/${sub[0] ?? '-'}`;
    });

    // 说明块是 AUTO_LAYOUT 子节点，只能 append —— 顺序必须在预算阶段就排好
    expect(order).toEqual(['经验条/A', '-/B', '血条/-']);
  });

  it('regression: a document without #### produces the exact same call sequence', async () => {
    const md = doc(`## 01. 战斗界面

### 经验条
@GUI

- a
- b

### 血条
@GUI

- h1
- 配图：血条示意
`);

    const a = makeBackend();
    const ta = traced(a.backend);
    await renderV2MarkdownToFigma({ markdown: md }, ta.backend);

    if (process.env.PRINT_CALL_SEQUENCE) {
      process.stdout.write(`\nCALL_SEQUENCE=${JSON.stringify(ta.log)}\n`);
    }

    // 基线：本 change 之前的调用序列。若分组实现污染了快路径，这里会立刻炸。
    expect(ta.log).toEqual(BASELINE_CALL_SEQUENCE);
  });
});

/** 判断 nodeId 是否位于 ancestorId 的子树内。 */
function isUnder(store: NodeStore, nodeId: string, ancestorId: string): boolean {
  let cur = store[nodeId]?.parentId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = store[cur]?.parentId;
  }
  return false;
}

/**
 * 无 `####` 文档的 backend 调用序列基线。
 *
 * 采集方式：`git stash push -- packages/figma-mcp-server/src` 回到本 change
 * 实现之前的引擎，再用同一个 mock 跑同一份 markdown 录下来的真实序列
 * （`PRINT_CALL_SEQUENCE=1` 会打印）。它锁死的是「快路径没被分组逻辑改动」，
 * 任何顺序/次数变化都必须是有意为之。
 */
const BASELINE_CALL_SEQUENCE: string[] = [
  'commitUndoCheckpoint',
  'cloneNode',
  'scanSubtree',
  'setMultipleTextContents',
  'getNodeInfo',
  'getNodesInfo',
  'setTextContent',
  'getNodeInfo',
  'getNodesInfo',
  'setTextContent',
  'getNodeInfo',
  'scanSubtree',
  'setTextContent',
  'getNodeInfo',
  'getNodesInfo',
  'batchCloneNodes',
  'scanSubtree',
  'getNodeInfo',
  'deleteNodes',
  'getNodeInfo',
  'scanSubtree',
  'setTextContent',
  'setTextContent',
  'deleteNodes',
  'getNodeInfo',
  'getNodesInfo',
  'deleteNodes',
  'batchCloneNodes',
  'setMultipleTextContents',
  'deleteNodes',
  'getNodeInfo',
  'getNodesInfo',
  'getNodeInfo',
  'getNodesInfo',
  'setTextContent',
  'getNodeInfo',
  'scanSubtree',
  'setTextContent',
  'setTextContent',
  'deleteNodes',
  'getNodeInfo',
  'getNodesInfo',
  'deleteNodes',
  'setMultipleTextContents',
  'scanSubtree',
  'setTextContent',
  'getNodeInfo',
  'getNodesInfo',
  'cloneNode',
  'getNodeInfo',
  'getNodesInfo',
  'setTextContent',
  'getNodeInfo',
  'moveNode',
  'getNodeInfo',
  'moveNode'
];
