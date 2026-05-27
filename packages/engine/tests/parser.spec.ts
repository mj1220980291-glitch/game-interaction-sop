/**
 * v2 parser unit tests.
 *
 * Spec: skills/game-interaction-sop/references/markdown-v2-spec.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseV2, HARD_ERROR_CODES, SOFT_WARNING_CODES } from '../src/v2/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseV2 — happy path (buzhong.md)', () => {
  const r = parseV2(fixture('buzhong.md'));

  it('returns ok=true', () => {
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('parses header 5 fields', () => {
    expect(r.ir?.header).toEqual({
      title: '部从卡牌TIPS',
      owner: '苗儿',
      group: '战斗交互',
      ticketLink: '#待补充',
      lastUpdate: '2026.05.12'
    });
  });

  it('parses overview', () => {
    expect(r.ir?.overview.background).toContain('本功能用于在战斗中查看部从');
    expect(r.ir?.overview.coreInteraction).toContain('玩家点击部从后');
  });

  it('parses 2 sections with correct names and indices', () => {
    expect(r.ir?.sections).toHaveLength(2);
    expect(r.ir?.sections[0]).toMatchObject({ index: '01', indexNum: 1, name: '部从选中与入口' });
    expect(r.ir?.sections[1]).toMatchObject({ index: '02', indexNum: 2, name: '主TIPS固定面板' });
  });

  it('parses clusters, roles, bullets', () => {
    const s1 = r.ir!.sections[0];
    expect(s1.clusters).toHaveLength(2);
    expect(s1.clusters[0]).toMatchObject({
      order: 1,
      title: '卡牌入口',
      roles: ['程序', 'GUI']
    });
    expect(s1.clusters[0]!.groups[0]!.bullets.length).toBeGreaterThan(0);
    expect(s1.clusters[1]).toMatchObject({
      order: 2,
      title: '选中与hover区分',
      roles: ['GUI', '动效']
    });
    // 配图 bullet retained (in any group)
    const allBullets = s1.clusters[1]!.groups.flatMap(g => g.bullets);
    expect(allBullets.some((b) => b.startsWith('配图'))).toBe(true);
  });

  it('produces no warnings on clean fixture', () => {
    expect(r.warnings).toEqual([]);
  });
});

describe('parseV2 — hard validation errors', () => {
  it('H2: missing title', () => {
    const r = parseV2('跟进UI：a\n需求组：b\n易协作链接：c\n最后更新时间：d');
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === HARD_ERROR_CODES.H2_TITLE_MISSING)).toBe(true);
  });

  it('H1: missing one header field', () => {
    const r = parseV2('# Demo\n\n跟进UI：a\n需求组：b\n易协作链接：c');
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === HARD_ERROR_CODES.H1_HEADER_MISSING)).toBe(true);
  });

  it('O1: missing 设计总览', () => {
    const r = parseV2(
      `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：d

## 01. xxx
### foo
@GUI

- a
`
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === HARD_ERROR_CODES.O1_OVERVIEW_MISSING)).toBe(true);
  });

  it('O2: 设计总览 has wrong subsections', () => {
    const r = parseV2(
      `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：d

## 设计总览

### 背景
xxx

### 交互
yyy

## 01. xx
### foo
@GUI
- a
`
    );
    expect(r.errors.some((e) => e.code === HARD_ERROR_CODES.O2_OVERVIEW_SUBSECTIONS_INVALID)).toBe(true);
  });

  it('S1: zero ## sections', () => {
    const r = parseV2(
      `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：d

## 设计总览

### 功能背景
bg

### 核心交互
core
`
    );
    expect(r.errors.some((e) => e.code === HARD_ERROR_CODES.S1_NO_SECTIONS)).toBe(true);
  });

  it('S2: section indices not contiguous', () => {
    const r = parseV2(
      `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：d

## 设计总览

### 功能背景
bg

### 核心交互
core

## 01. one
### a
@GUI
- x

## 03. three
### b
@GUI
- y
`
    );
    expect(r.errors.some((e) => e.code === HARD_ERROR_CODES.S2_SECTION_INDEX_NOT_CONTIGUOUS)).toBe(true);
  });

  it('C1: section without ###', () => {
    const r = parseV2(
      `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：d

## 设计总览

### 功能背景
bg

### 核心交互
core

## 01. empty section
some text but no ###
`
    );
    expect(r.errors.some((e) => e.code === HARD_ERROR_CODES.C1_NO_CLUSTERS)).toBe(true);
  });

  it('C2: ### missing @role line', () => {
    const r = parseV2(
      `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：d

## 设计总览

### 功能背景
bg

### 核心交互
core

## 01. xx
### foo

- bullet
`
    );
    expect(r.errors.some((e) => e.code === HARD_ERROR_CODES.C2_ROLE_LINE_MISSING)).toBe(true);
  });
});

describe('parseV2 — soft warnings', () => {
  it('W1: unknown role', () => {
    const r = parseV2(
      `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：d

## 设计总览

### 功能背景
bg

### 核心交互
core

## 01. xx 界面
### foo
@程序 @后端

- bullet
`
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === SOFT_WARNING_CODES.W1_UNKNOWN_ROLE)).toBe(true);
  });

  it('W2: dead-category cluster name', () => {
    const r = parseV2(
      `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：d

## 设计总览

### 功能背景
bg

### 核心交互
core

## 01. xx 界面
### 显示规则
@GUI

- a
`
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === SOFT_WARNING_CODES.W2_DEAD_CATEGORY_CLUSTER_NAME)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Task 4.2 — #### 子分类小标题用例（8 个）
// ─────────────────────────────────────────────────────────────

/** 构造一个最小合法 v2 Markdown，章节内只有一个簇，簇的 body 由调用方提供 */
function wrapCluster(clusterBody: string): string {
  return `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：2026.05.14

## 设计总览

### 功能背景
bg

### 核心交互
core

## 01. 测试界面

### 测试簇
${clusterBody}
`;
}

describe('parseV2 — #### 子分类小标题', () => {
  // 用例 1：无 #### → 单 group + title=null（向后兼容）
  it('无 #### → 产出 1 个 title=null 的 group', () => {
    const r = parseV2(wrapCluster('@GUI\n\n- 规则1\n- 规则2'));
    expect(r.ok).toBe(true);
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    expect(cluster.groups).toHaveLength(1);
    expect(cluster.groups[0]!.title).toBeNull();
    expect(cluster.groups[0]!.bullets).toEqual(['规则1', '规则2']);
  });

  // 用例 2：单 #### → 1 个具名 group
  it('单个 #### → 1 个具名 group', () => {
    const r = parseV2(wrapCluster('@GUI\n\n#### 基础信息\n- 规则1\n- 规则2'));
    expect(r.ok).toBe(true);
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    expect(cluster.groups).toHaveLength(1);
    expect(cluster.groups[0]!.title).toBe('基础信息');
    expect(cluster.groups[0]!.bullets).toEqual(['规则1', '规则2']);
  });

  // 用例 3：两个 #### → 2 个具名 group
  it('两个 #### → 2 个具名 group（subgroup-basic fixture）', () => {
    const md = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'subgroup-basic.md'),
      'utf8'
    );
    const r = parseV2(md);
    expect(r.ok).toBe(true);
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    expect(cluster.groups).toHaveLength(2);
    expect(cluster.groups[0]!.title).toBe('基础信息');
    expect(cluster.groups[1]!.title).toBe('升级反馈');
    expect(cluster.groups[0]!.bullets.length).toBeGreaterThan(0);
    expect(cluster.groups[1]!.bullets.length).toBeGreaterThan(0);
  });

  // 用例 4：三个 ####
  it('三个 #### → 3 个具名 group', () => {
    const r = parseV2(wrapCluster(
      '@GUI\n\n#### A\n- a1\n\n#### B\n- b1\n\n#### C\n- c1'
    ));
    expect(r.ok).toBe(true);
    const groups = r.ir!.sections[0]!.clusters[0]!.groups;
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.title)).toEqual(['A', 'B', 'C']);
  });

  // 用例 5：游离 bullets + #### → W3 warning + title=null 默认组放 index=0
  it('游离 bullets + #### → emit W3 + title=null 默认组在前', () => {
    const md = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'subgroup-mixed.md'),
      'utf8'
    );
    const r = parseV2(md);
    expect(r.ok).toBe(true);
    expect(r.warnings.some(w => w.code === SOFT_WARNING_CODES.W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS)).toBe(true);
    const groups = r.ir!.sections[0]!.clusters[0]!.groups;
    expect(groups[0]!.title).toBeNull();
    expect(groups[1]!.title).toBe('升级反馈');
  });

  // 用例 6：分组标题超长
  it('#### 标题超长 → hard error H_GROUP_TITLE_LEN_OVERFLOW', () => {
    // 25 个 ASCII 字符 > 24
    const longTitle = 'A'.repeat(25);
    const r = parseV2(wrapCluster(`@GUI\n\n#### ${longTitle}\n- 规则`));
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.code === HARD_ERROR_CODES.H_GROUP_TITLE_LEN_OVERFLOW)).toBe(true);
  });

  // 用例 7：同簇重名 ####
  it('同簇重名 #### → hard error H_GROUP_TITLE_DUPLICATE', () => {
    const r = parseV2(wrapCluster('@GUI\n\n#### 基础信息\n- a\n\n#### 基础信息\n- b'));
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.code === HARD_ERROR_CODES.H_GROUP_TITLE_DUPLICATE)).toBe(true);
  });

  // 用例 8：#### 出现在 ## 与 ### 之间（orphan）
  it('#### 出现在章节顶层（orphan）→ hard error H_H4_ORPHAN', () => {
    const r = parseV2(`# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：2026.05.14

## 设计总览

### 功能背景
bg

### 核心交互
core

## 01. 测试界面

#### 孤立子标题
- 规则

### 测试簇
@GUI
- 规则
`);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.code === HARD_ERROR_CODES.H_H4_ORPHAN)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Task 3.3 — subgroup-render-2group fixture IR smoke
// ─────────────────────────────────────────────────────────────

describe('parseV2 — subgroup-render-2group fixture', () => {
  const md = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'subgroup-render-2group.md'),
    'utf8'
  );
  const r = parseV2(md);

  it('parses ok with no errors', () => {
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('section 01 has 2 clusters', () => {
    expect(r.ir!.sections[0]!.clusters).toHaveLength(2);
  });

  it('cluster "经验条" has 2 named groups', () => {
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    expect(cluster.title).toBe('经验条');
    expect(cluster.groups).toHaveLength(2);
    expect(cluster.groups[0]!.title).toBe('基础信息');
    expect(cluster.groups[1]!.title).toBe('升级反馈');
  });

  it('"基础信息" group has ≥ 1 bullet, "升级反馈" group has ≥ 1 bullet with 配图', () => {
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    expect(cluster.groups[0]!.bullets.length).toBeGreaterThan(0);
    expect(cluster.groups[1]!.bullets.length).toBeGreaterThan(0);
    expect(cluster.groups[1]!.bullets.some(b => /配图/.test(b))).toBe(true);
  });

  it('cluster "等级徽章" has 1 group with title=null', () => {
    const cluster = r.ir!.sections[0]!.clusters[1]!;
    expect(cluster.title).toBe('等级徽章');
    expect(cluster.groups).toHaveLength(1);
    expect(cluster.groups[0]!.title).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// add-classify-prephase-for-markdown:
// S3 (H_SECTION_NOT_INTERFACE) + W6 (W_CLUSTER_NAME_LOOKS_RULE)
// + W2 (W2_DEAD_CATEGORY_CLUSTER_NAME) for ### / #### naming
// ─────────────────────────────────────────────────────────────

describe('parseV2 — S3 / W6 / W2 命名校验', () => {
  it('reports H_SECTION_NOT_INTERFACE for stage-style section name', () => {
    const md = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'naming-violation-section.md'),
      'utf8'
    );
    const r = parseV2(md);
    expect(r.ok).toBe(false);
    expect(
      r.errors.some((e) => e.code === HARD_ERROR_CODES.H_SECTION_NOT_INTERFACE)
    ).toBe(true);
    const sectionErr = r.errors.find(
      (e) => e.code === HARD_ERROR_CODES.H_SECTION_NOT_INTERFACE
    );
    expect(sectionErr?.message).toContain('准备环节');
    expect(sectionErr?.message).toContain('界面关键词');
  });

  it('reports W_CLUSTER_NAME_LOOKS_RULE for rule-property suffix on ### cluster', () => {
    const md = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'naming-violation-cluster.md'),
      'utf8'
    );
    const r = parseV2(md);
    expect(r.ok).toBe(true);
    expect(
      r.warnings.some(
        (w) =>
          w.code === SOFT_WARNING_CODES.W_CLUSTER_NAME_LOOKS_RULE &&
          (w.context?.includes('展开 / 收起时机') ?? false)
      )
    ).toBe(true);
  });

  it('reports W2_DEAD_CATEGORY for legacy dead-category cluster name', () => {
    const md = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'naming-violation-cluster.md'),
      'utf8'
    );
    const r = parseV2(md);
    expect(
      r.warnings.some(
        (w) =>
          w.code === SOFT_WARNING_CODES.W2_DEAD_CATEGORY_CLUSTER_NAME &&
          (w.context?.includes('显示规则') ?? false)
      )
    ).toBe(true);
  });

  it('W6 also applies to #### sub-group title with rule-property suffix', () => {
    const md = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'naming-violation-cluster.md'),
      'utf8'
    );
    const r = parseV2(md);
    expect(
      r.warnings.some(
        (w) =>
          w.code === SOFT_WARNING_CODES.W_CLUSTER_NAME_LOOKS_RULE &&
          (w.context?.includes('视觉层级') ?? false)
      )
    ).toBe(true);
  });

  it('合法命名（"锁定天书按钮" / "升级反馈"）不触发 W6 / W2', () => {
    const md = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'naming-violation-cluster.md'),
      'utf8'
    );
    const r = parseV2(md);
    // ### 锁定天书按钮 (context 恰好等于 "锁定天书按钮")
    const noiseForLockButton = r.warnings.filter(
      (w) =>
        w.context === '锁定天书按钮' &&
        (w.code === SOFT_WARNING_CODES.W_CLUSTER_NAME_LOOKS_RULE ||
          w.code === SOFT_WARNING_CODES.W2_DEAD_CATEGORY_CLUSTER_NAME)
    );
    expect(noiseForLockButton).toHaveLength(0);

    // #### 升级反馈 (context 形如 "锁定天书按钮 > 升级反馈")
    const noiseForUpgradeFeedback = r.warnings.filter(
      (w) =>
        w.context?.endsWith('> 升级反馈') &&
        (w.code === SOFT_WARNING_CODES.W_CLUSTER_NAME_LOOKS_RULE ||
          w.code === SOFT_WARNING_CODES.W2_DEAD_CATEGORY_CLUSTER_NAME)
    );
    expect(noiseForUpgradeFeedback).toHaveLength(0);
  });
});
