/**
 * `####` 簇内子分类小标题 — render 侧（槽位方案）。
 *
 * 一个 `####` 子分类渲染成 说明块 内的一段「槽位」：
 *   #Title + Frame 4273xxx + 正文/规则×N + 配图
 * 簇级身份（标题 GROUP：蓝色圆圈编号 + #Title_Main）整块只出现一次。
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
最后更新时间：2026.08.11

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。
`;

function doc(body: string): string {
  return `${HEAD}\n${body}`.trim();
}

/** 渲染产物里的所有 说明块，按右栏顺序。 */
function blocks(store: NodeStore, rootId: string) {
  const rightCol = collectByName(store, rootId, 'Text')[0];
  if (!rightCol) throw new Error('rendered doc has no right column');
  return rightCol.children
    .map((id) => store[id]!)
    .filter((n) => n.name.startsWith('说明块'));
}

/**
 * 说明块的直接子节点摘要，形如 `#Title="基础信息"`, `正文/规则="a"`。
 * 槽位方案关心的正是**直接子节点的顺序**，所以断言按这个粒度做。
 */
function layoutOf(store: NodeStore, blockId: string): string[] {
  return (store[blockId]?.children ?? []).map((id) => {
    const n = store[id]!;
    const label = n.name.startsWith('Frame 4273') ? '角色框' : n.name;
    return n.type === 'TEXT' ? `${label}="${n.characters ?? ''}"` : label;
  });
}

/** 某个说明块内某个名字的所有节点的 characters。 */
function textsIn(store: NodeStore, blockId: string, name: string): string[] {
  return collectByName(store, blockId, name).map((n) => n.characters ?? '');
}

/** 记录每个 backend 方法的调用序列，用于逐项回归比对。 */
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

describe('renderV2MarkdownToFigma — #### sub-groups render as slot runs', () => {
  it('two groups become two slot runs inside ONE block, in document order', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI

#### 基础信息
- a1
- a2

#### 升级反馈
- b1
`)
      },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    const bs = blocks(store, result.rootInstanceId!);
    expect(bs).toHaveLength(1);

    expect(layoutOf(store, bs[0]!.id)).toEqual([
      '标题',
      '#Title="基础信息"',
      '角色框',
      '正文/规则="a1"',
      '正文/规则="a2"',
      '#Title="升级反馈"',
      '正文/规则="b1"'
    ]);
  });

  it('the cluster header survives untouched — badge and main title appear once', async () => {
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

    const block = blocks(store, result.rootInstanceId!)[0]!;
    expect(textsIn(store, block.id, 'Number')).toEqual(['1']);
    expect(textsIn(store, block.id, '#Title_Main')).toEqual(['经验条']);
    // 蓝色圆圈是 Base VECTOR，和 Number 同属 交互说明标记。
    // 「删 Number 保留 Base」会在图上留一个空心圆，这里锁死它必须成对存在。
    expect(collectByName(store, block.id, 'Base')).toHaveLength(1);
    expect(collectByName(store, block.id, '交互说明标记')).toHaveLength(1);
  });

  it('role tags render once, above the first sub-group only', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 经验条
@GUI @程序

#### A
- a

#### B
- b
`)
      },
      backend
    );

    const block = blocks(store, result.rootInstanceId!)[0]!;
    const roleFrames = block.children
      .map((id) => store[id]!)
      .filter((n) => n.name.startsWith('Frame 4273'));

    expect(roleFrames).toHaveLength(1);
    // @roles 是簇级声明，每个子分类重复一遍只是噪音
    expect(textsIn(store, roleFrames[0]!.id, '职能标签/完整').sort()).toEqual([
      '@GUI',
      '@程序'
    ]);
  });

  it('配图 lands only in the run whose group declared it', async () => {
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

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    const block = blocks(store, result.rootInstanceId!)[0]!;
    expect(layoutOf(store, block.id)).toEqual([
      '标题',
      '#Title="A"',
      '角色框',
      '正文/规则="a"',
      '#Title="B"',
      '正文/规则="b"',
      '配图'
    ]);
    expect(textsIn(store, block.id, '配图占位文案')).toEqual([
      '配图占位：升级特效示意'
    ]);
  });

  it('mixed free bullets + ####: the leading run carries no heading', async () => {
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

    const block = blocks(store, result.rootInstanceId!)[0]!;
    // 隐式分组没有标题，绝不能留下模板的 "小标题1" 占位
    expect(layoutOf(store, block.id)).toEqual([
      '标题',
      '角色框',
      '正文/规则="游离"',
      '#Title="基础信息"',
      '正文/规则="a"'
    ]);
    expect(textsIn(store, block.id, '#Title')).toEqual(['基础信息']);
  });

  it('more groups than the template ships slots for (2) still render in order', async () => {
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

#### D
- d
`)
      },
      backend
    );

    const block = blocks(store, result.rootInstanceId!)[0]!;
    expect(
      layoutOf(store, block.id).filter((l) => l.startsWith('#Title='))
    ).toEqual(['#Title="A"', '#Title="B"', '#Title="C"', '#Title="D"']);
  });

  it('a grouped cluster and a flat cluster coexist in one section', async () => {
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

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    const bs = blocks(store, result.rootInstanceId!);
    expect(bs).toHaveLength(2);

    expect(textsIn(store, bs[0]!.id, '#Title_Main')).toEqual(['经验条']);
    expect(textsIn(store, bs[0]!.id, '#Title')).toEqual(['A', 'B']);

    expect(textsIn(store, bs[1]!.id, '#Title_Main')).toEqual(['血条']);
    // 无 #### 的簇必须一个 #Title 都不剩
    expect(textsIn(store, bs[1]!.id, '#Title')).toEqual([]);
    expect(textsIn(store, bs[1]!.id, 'Number')).toEqual(['2']);
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
`);

    const a = makeBackend();
    const ta = traced(a.backend);
    const result = await renderV2MarkdownToFigma({ markdown: md }, ta.backend);

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    if (process.env.PRINT_CALL_SEQUENCE) {
      process.stdout.write(`\nCALL_SEQUENCE=${JSON.stringify(ta.log)}\n`);
    }

    expect(ta.log).toEqual(EXPECTED_CALL_SEQUENCE);
  });
});

/**
 * 无 `####` 文档的 backend 调用序列基线。
 *
 * 采集方式：`git stash push -- packages/figma-mcp-server/src` 回到本 change
 * 实现之前的引擎，用**当前这份 mock**（已按真模板重建）跑同一份 markdown
 * 录下来的真实序列（`PRINT_CALL_SEQUENCE=1` 打印）。
 *
 * 它锁死的是「`####` 的实现完全没有碰无分组快路径」。任何顺序或次数变化都
 * 必须是有意为之，并且要重新用同样的方式采集基线，而不是照抄跑出来的结果。
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
  'scanSubtree',
  'getNodeInfo',
  'deleteNodes',
  'getNodeInfo',
  'scanSubtree',
  'setTextContent',
  'setTextContent',
  'deleteNodes',
  'deleteNodes',
  'getNodeInfo',
  'getNodesInfo',
  'deleteNodes',
  'deleteNodes',
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
  'deleteNodes',
  'getNodeInfo',
  'getNodesInfo',
  'deleteNodes',
  'deleteNodes',
  'setMultipleTextContents',
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

/**
 * 基线 + 本轮唯一一处**有意**偏移。
 *
 * Bug C 的修复把「删掉本簇多余的 `配图`」拆成了两步：循环内删除时跳过章节种子，
 * 循环结束后 `ImageSeed.flush` 再补一次 `deleteNodes`。所以快路径比基线多且只多
 * 这一次调用，位置固定在 cluster 循环之后、气泡 probe/move 之前——也就是基线
 * 末尾那 4 项（`getNodeInfo, moveNode, getNodeInfo, moveNode`）之前。
 *
 * 这里刻意不去改 BASELINE_CALL_SEQUENCE 本体：它记录的是「实现 `####` 之前」的
 * 真实序列，是唯一的地面真相；每一处偏离都应当像这样单独写出来并说明理由。
 */
const EXPECTED_CALL_SEQUENCE: string[] = [
  ...BASELINE_CALL_SEQUENCE.slice(0, -4),
  'deleteNodes', // ImageSeed.flush
  ...BASELINE_CALL_SEQUENCE.slice(-4),
  // reconcile-render：渲染全部结束后再读一次整棵树、按位置把 IR 映射到节点，
  // 一次性写入标记。放在最末尾、且只追加不插入，是为了证明打标记没有改动
  // 任何渲染步骤——它只读取渲染结果，不参与渲染。
  'readStampedTree',
  'stampNodes'
];
