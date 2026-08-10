/**
 * `####` 簇内子分类小标题 — parser 侧。
 *
 * Spec: packages/skill/references/markdown-v2-spec.md「簇内子分类小标题」
 *       G1 / G2 / G3 硬校验，W5 软警告
 * Change: openspec/changes/port-subgroup-headings-to-mcp-server
 */

import { describe, it, expect } from 'vitest';
import { parseV2 } from '../../src/v2/parser.js';
import { HARD_ERROR_CODES, SOFT_WARNING_CODES } from '../../src/v2/ir.js';

const HEAD = `# 子分组文档

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

function firstCluster(markdown: string) {
  const r = parseV2(markdown);
  return { r, cluster: r.ir?.sections[0]?.clusters[0] };
}

describe('parseV2 — #### sub-groups', () => {
  it('splits a cluster into one group per ####', () => {
    const { r, cluster } = firstCluster(
      doc(`## 01. 战斗界面

### 经验条
@程序 @GUI

#### 基础信息
- 等级标签右侧显示黄色进度条
- 展示当前等级的经验进度

#### 升级反馈
- 满格时触发升级特效
`)
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(cluster?.groups).toEqual([
      {
        title: '基础信息',
        bullets: ['等级标签右侧显示黄色进度条', '展示当前等级的经验进度']
      },
      { title: '升级反馈', bullets: ['满格时触发升级特效'] }
    ]);
  });

  it('keeps bullets as the flattened view of groups', () => {
    const { cluster } = firstCluster(
      doc(`## 01. 战斗界面

### 经验条
@程序

#### A
- a1

#### B
- b1
- b2
`)
    );

    expect(cluster?.bullets).toEqual(['a1', 'b1', 'b2']);
  });

  it('emits a single implicit null-title group when there is no ####', () => {
    const { r, cluster } = firstCluster(
      doc(`## 01. 战斗界面

### 经验条
@程序

- 只有一条
`)
    );

    expect(r.ok).toBe(true);
    expect(cluster?.groups).toEqual([{ title: null, bullets: ['只有一条'] }]);
  });

  it('G1: #### before any ### in a section is a hard error', () => {
    const { r } = firstCluster(
      doc(`## 01. 战斗界面

#### 游离小标题
- 无处安放

### 经验条
@程序

- a
`)
    );

    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain(HARD_ERROR_CODES.H_H4_ORPHAN);
  });

  it('G2: #### title wider than 24 display columns is a hard error', () => {
    // 13 个中文字 = 显示宽度 26 > 24
    const { r } = firstCluster(
      doc(`## 01. 战斗界面

### 经验条
@程序

#### 一二三四五六七八九十十一十二十三
- a
`)
    );

    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain(
      HARD_ERROR_CODES.H_GROUP_TITLE_LEN_OVERFLOW
    );
  });

  it('G2: exactly 12 Chinese chars (width 24) is accepted', () => {
    const { r } = firstCluster(
      doc(`## 01. 战斗界面

### 经验条
@程序

#### 一二三四五六七八九十十一
- a
`)
    );

    expect(r.errors.map((e) => e.code)).not.toContain(
      HARD_ERROR_CODES.H_GROUP_TITLE_LEN_OVERFLOW
    );
  });

  it('G3: duplicate #### titles in the same cluster are a hard error (case-insensitive)', () => {
    const { r } = firstCluster(
      doc(`## 01. 战斗界面

### 经验条
@程序

#### Basic
- a

#### basic
- b
`)
    );

    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain(
      HARD_ERROR_CODES.H_GROUP_TITLE_DUPLICATE
    );
  });

  it('G3: the same #### title in two different clusters is fine', () => {
    const { r } = firstCluster(
      doc(`## 01. 战斗界面

### 经验条
@程序

#### 基础信息
- a

### 血条
@程序

#### 基础信息
- b
`)
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
  });

  it('W5: free bullets before the first #### warn but do not block', () => {
    const { r, cluster } = firstCluster(
      doc(`## 01. 战斗界面

### 经验条
@程序

- 游离的一条

#### 基础信息
- a
`)
    );

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain(
      SOFT_WARNING_CODES.W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS
    );
    expect(cluster?.groups).toEqual([
      { title: null, bullets: ['游离的一条'] },
      { title: '基础信息', bullets: ['a'] }
    ]);
  });

  it('#### lines never leak into bullets', () => {
    const { cluster } = firstCluster(
      doc(`## 01. 战斗界面

### 经验条
@程序

#### 基础信息
- a
`)
    );

    expect(cluster?.bullets.some((b) => b.includes('####'))).toBe(false);
    expect(cluster?.bullets).toEqual(['a']);
  });
});
