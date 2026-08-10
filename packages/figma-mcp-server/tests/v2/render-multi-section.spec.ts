/**
 * Unit tests for renderV2MarkdownToFigma — multi-section clone ordering.
 *
 * Bug fix (2026-05-28): all section clones MUST be made before any section
 * is rendered.  Previously, masterSectionGroup was cloned AFTER section 0
 * was already filled, causing sections 1-N to inherit section 0's bubble
 * nodes and cluster blocks.
 *
 * Spec: openspec/changes/fix-section-clone-before-render/specs/
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import { makeBackend } from './helpers/mock-backend.js';

// ---------------------------------------------------------------------------
// Minimal 2-section markdown
// ---------------------------------------------------------------------------

const MD_2_SECTIONS = `
# 测试文档

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.05.28

## 设计总览

### 功能背景

背景说明。

### 核心交互

核心交互说明。

## 01. 第一界面

### 第一界面A
@GUI

- bullet A1
- bullet A2
- bullet A3

### 第一界面B
@GUI

- bullet B1
- bullet B2

## 02. 第二界面

### 第二界面C
@GUI

- bullet C1
`.trim();

const MD_3_SECTIONS = `
# 三章节文档

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.05.28

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。

## 01. 章节一

### 簇A
@GUI

- a1
- a2
- a3

### 簇B
@GUI

- b1

### 簇C
@GUI

- c1

## 02. 章节二

### 簇D
@GUI

- d1

## 03. 章节三

### 簇E
@GUI

- e1
- e2
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderV2MarkdownToFigma — multi-section clone ordering (bug fix 2026-05-28)', () => {

  it('2 sections: section 2 bubble frame contains only 1 bubble (its own cluster)', async () => {
    const { backend, cloneLog } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      { markdown: MD_2_SECTIONS },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    // cloneLog[0] = first clone of masterSectionGroup (for section 2).
    // At clone time, bubble frame should contain only the TEMPLATE'S original
    // seed nodes (2 seeds: 标号/2 and 标号/1), NOT any render-added bubbles.
    // If the old bug were present, clone time would have 3+ items (template
    // seeds + rendered bubbles from section 1).
    expect(cloneLog).toHaveLength(1); // 2 sections → 1 clone
    // Template has 2 seeds; at clone time only template seeds should be present.
    expect(cloneLog[0]!.contentAtCallTime).toHaveLength(2); // [标号/2, 标号/1]
  });

  it('3 sections: each section clone is made before any rendering fills the master', async () => {
    const { backend, cloneLog } = makeBackend();

    await renderV2MarkdownToFigma(
      { markdown: MD_3_SECTIONS },
      backend
    );

    // 3 sections → 2 clones of masterSectionGroup
    expect(cloneLog).toHaveLength(2);

    // Both clones should have been made when bubble frame had only the 2 template seeds.
    // If old bug present: cloneLog[1].contentAtCallTime would have 3+ items.
    expect(cloneLog[0]!.contentAtCallTime).toHaveLength(2);
    expect(cloneLog[1]!.contentAtCallTime).toHaveLength(2);
  });

  it('2 sections: section 1 has 2 clusters, section 2 has 1 cluster — bubble counts match', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      { markdown: MD_2_SECTIONS },
      backend
    );

    expect(result.ok).toBe(true);

    // After rendering 2 sections, there should be 2 气泡 FRAMEs (one per
    // section), with 2 and 1 bubbles respectively.
    const allBubbleFrames = Object.values(store)
      .filter((n) => n.name === '气泡')
      .sort((a, b) => a.id.localeCompare(b.id));

    expect(allBubbleFrames.length).toBeGreaterThanOrEqual(2);

    // Section 1 has 2 clusters → its 气泡 FRAME has 2 children
    expect(allBubbleFrames.find((f) => f.children.length === 2)).toBeDefined();
    // Section 2 has 1 cluster → its 气泡 FRAME has 1 child
    expect(allBubbleFrames.find((f) => f.children.length === 1)).toBeDefined();
  });

  it('single section: behavior unchanged after refactor', async () => {
    const { backend, cloneLog } = makeBackend();

    const MD_1_SECTION = `
# 单章节文档

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.05.28

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。

## 01. 唯一章节

### 唯一簇A
@GUI

- bullet 1
- bullet 2
`.trim();

    const result = await renderV2MarkdownToFigma(
      { markdown: MD_1_SECTION },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    // No clones of masterSectionGroup needed for single-section docs
    expect(cloneLog).toHaveLength(0);
  });

  it('orphan seed trim: template has 2 seeds [标号/2, 标号/1], after render bubble count = cluster count', async () => {
    // This test verifies the fix for the orphan-seed bug:
    // Real 1:14 template has [标号/2, 标号/1] in 气泡 FRAME.
    // Without fix: 标号/1 becomes orphan → extra bubble always present.
    // With fix: trim deletes 标号/1 before cluster loop → no orphan.
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      { markdown: MD_2_SECTIONS },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    const allBubbleFrames = Object.values(store).filter((n) => n.name === '气泡');
    expect(allBubbleFrames.length).toBeGreaterThanOrEqual(2);

    for (const bf of allBubbleFrames) {
      const bubbleChildren = bf.children.map((id) => store[id]).filter(Boolean);
      // All remaining children should have names starting with '标号/'
      for (const child of bubbleChildren) {
        expect(child!.name).toMatch(/^标号\//);
      }
    }

    // MD_2_SECTIONS: section 1 has 2 clusters, section 2 has 1 cluster.
    // With fix: section 1 bubble frame = 2, section 2 bubble frame = 1.
    // Without fix: both frames would have extra orphan (3 and 2 respectively).
    const frameSizes = allBubbleFrames.map((f) => f.children.length).sort();
    expect(frameSizes).toContain(1); // section 2: 1 cluster
    expect(frameSizes).toContain(2); // section 1: 2 clusters
    expect(frameSizes.every((s) => s <= 2)).toBe(true);
  });
});
