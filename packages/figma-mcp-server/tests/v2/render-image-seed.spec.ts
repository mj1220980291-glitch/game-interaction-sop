/**
 * Bug C — 章节种子 `配图` 被前序簇删掉，后续簇克隆时炸掉整篇渲染。
 *
 * 模板里唯一的 `配图` GROUP 长在 说明块01 里，也就是簇 0 要渲染进去的那个块；
 * 说明块02 压根没有 `配图`。于是「簇 0 不要配图、簇 1 要配图」这一种再普通不过
 * 的排布，会让簇 0 把种子连同自己块内的配图一起删掉，簇 1 再去克隆时拿到的是
 * 一个已经不存在的 id：`cloneNode: source not found`，整篇渲染失败。
 *
 * 修复见 render.ts 的 ImageSeed：循环内的删除跳过种子，循环结束后统一 flush。
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { makeBackend, collectByName, type NodeStore } from './helpers/mock-backend.js';

const HEAD = `# 配图种子

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

function blocks(store: NodeStore, rootId: string) {
  const rightCol = collectByName(store, rootId, 'Text')[0];
  if (!rightCol) throw new Error('rendered doc has no right column');
  return rightCol.children
    .map((id) => store[id]!)
    .filter((n) => n.name.startsWith('说明块'));
}

/** 某块内所有 `配图` GROUP 的占位文案。 */
function imageHintsIn(store: NodeStore, blockId: string): string[] {
  return collectByName(store, blockId, '配图').flatMap((g) =>
    collectByName(store, g.id, '配图占位文案').map((t) => t.characters ?? '')
  );
}

describe('章节种子 配图 的生命周期 (Bug C)', () => {
  it('前一个簇不要配图、后一个簇要配图时仍能渲染', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 血条
@GUI

- 血量低于 30% 时边缘泛红

### 经验条
@GUI

- 满格触发升级特效
- 配图：升级特效示意
`)
      },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    const bs = blocks(store, result.rootInstanceId!);
    expect(bs).toHaveLength(2);

    // 不要配图的簇：块内一个 配图 都不剩（种子也已在 flush 时被删）。
    expect(collectByName(store, bs[0]!.id, '配图')).toHaveLength(0);

    // 要配图的簇：拿到了从种子克隆出来的那一个，描述写进了占位文案。
    expect(imageHintsIn(store, bs[1]!.id)).toEqual(['配图占位：升级特效示意']);
  });

  it('前一个簇走 #### 槽位路径时同样不会误杀种子', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 血条
@GUI

#### 基础表现
- 血量低于 30% 时边缘泛红

#### 异常态
- 断线重连不做补间

### 经验条
@GUI

- 满格触发升级特效
- 配图：升级特效示意
`)
      },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    const bs = blocks(store, result.rootInstanceId!);
    expect(bs).toHaveLength(2);
    expect(collectByName(store, bs[0]!.id, '配图')).toHaveLength(0);
    expect(imageHintsIn(store, bs[1]!.id)).toEqual(['配图占位：升级特效示意']);
  });

  it('没有任何簇要配图时，模板自带的 配图 全部清干净', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      {
        markdown: doc(`## 01. 战斗界面

### 血条
@GUI

- a

### 经验条
@GUI

- b
`)
      },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    expect(collectByName(store, result.rootInstanceId!, '配图')).toHaveLength(0);
  });
});
