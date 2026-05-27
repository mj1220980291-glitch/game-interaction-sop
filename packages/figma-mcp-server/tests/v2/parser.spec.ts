/**
 * v2 parser unit tests.
 *
 * Spec: skills/game-interaction-sop/references/markdown-v2-spec.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseV2, HARD_ERROR_CODES, SOFT_WARNING_CODES } from '../../src/v2/index.js';

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
      title: '入口规则',
      roles: ['程序', 'GUI']
    });
    expect(s1.clusters[0].bullets.length).toBeGreaterThan(0);
    expect(s1.clusters[1]).toMatchObject({
      order: 2,
      title: '选中与hover区分',
      roles: ['GUI', '动效']
    });
    // 配图 bullet retained
    expect(s1.clusters[1].bullets.some((b) => b.startsWith('配图'))).toBe(true);
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

## 01. xx
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

## 01. xx
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
// strip-h4-in-mcp-server-parser:
// parseClusters STRIP_H4 behaviour
// ─────────────────────────────────────────────────────────────

describe('parseV2 — #### strip behaviour (h4-strip.md)', () => {
  const r = parseV2(fixture('h4-strip.md'));

  it('parses ok with no errors', () => {
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('#### 行不出现在 bullets[] 里（默认 stripH4=true）', () => {
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    const hasH4Literal = cluster.bullets.some((b) => b.startsWith('####'));
    expect(hasH4Literal).toBe(false);
  });

  it('#### 分组下的真实 bullet 被保留', () => {
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    // h4-strip.md has 5 real bullets across 2 subgroups
    expect(cluster.bullets.length).toBe(5);
    expect(cluster.bullets[0]).toBe('当前等级标签右侧显示一条黄色进度条');
    expect(cluster.bullets[4]).toBe('升级音效同步播放');
  });
});

describe('parseV2 — #### strip edge: 只有 #### 无真实 bullet', () => {
  it('bullets 为空数组', () => {
    const md = `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：2026.05.27

## 设计总览

### 功能背景
bg

### 核心交互
core

## 01. 测试界面

### 仅分组标题簇
@GUI

#### 只有标题没有bullet
#### 另一个标题也没有bullet
`;
    const r = parseV2(md);
    expect(r.ok).toBe(true);
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    expect(cluster.bullets).toEqual([]);
  });
});

describe('parseV2 — stripH4: false 回退原始行为', () => {
  it('stripH4=false 时 #### 字面量出现在 bullets[]', () => {
    const md = `# Demo
跟进UI：a
需求组：b
易协作链接：c
最后更新时间：2026.05.27

## 设计总览

### 功能背景
bg

### 核心交互
core

## 01. 测试界面

### 含分组标题的簇
@GUI

#### 基础信息
- 规则1
- 规则2
`;
    const r = parseV2(md, { stripH4: false });
    expect(r.ok).toBe(true);
    const cluster = r.ir!.sections[0]!.clusters[0]!;
    // With stripH4=false, the "#### 基础信息" line is pushed as-is
    expect(cluster.bullets.some((b) => b.startsWith('####'))).toBe(true);
    // Real bullets still present
    expect(cluster.bullets).toContain('规则1');
    expect(cluster.bullets).toContain('规则2');
  });
});
