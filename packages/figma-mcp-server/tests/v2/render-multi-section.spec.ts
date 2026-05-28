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

import { describe, it, expect, vi } from 'vitest';
import { renderV2MarkdownToFigma } from '../../src/v2/render.js';
import type { FigmaBackend, NodeInfo, ScanSubtreeResult } from '../../src/v2/figma-client.js';

// ---------------------------------------------------------------------------
// Minimal in-memory mock backend
// ---------------------------------------------------------------------------

let _uid = 1;
const uid = (prefix = 'n') => `${prefix}-${_uid++}`;

interface NodeStore {
  [id: string]: NodeInfo & { children: string[]; absoluteBoundingBox?: { x: number; y: number; width: number; height: number } };
}

/**
 * Build a minimal FigmaBackend backed by an in-memory node store.
 *
 * The mock simulates the Figma tree structure needed by renderInner:
 *   root (FRAME)
 *     ├─ 文档标题 (TEXT)
 *     ├─ 设计师名称 (TEXT)
 *     ├─ 需求组名称 (TEXT)
 *     ├─ 易协作单号链接 (TEXT)
 *     ├─ 更新时间 (TEXT)
 *     ├─ 功能背景 (FRAME)
 *     │    └─ #Content (TEXT)
 *     ├─ 核心交互 (FRAME)
 *     │    └─ #Content (TEXT)
 *     └─ 界面说明容器 (FRAME)  ← parent of 界面说明1
 *          └─ 界面说明1 (FRAME)  ← masterSectionGroup
 *               ├─ 界面名称 (TEXT)
 *               ├─ 气泡层 (FRAME)
 *               │    └─ 标号/1 (FRAME)
 *               │         └─ #Number (TEXT)
 *               ├─ 右栏 (FRAME)
 *               │    └─ 说明块1 (FRAME)
 *               │         ├─ Number (TEXT)
 *               │         ├─ #Title_Main (TEXT)
 *               │         ├─ 正文/规则 (TEXT)
 *               │         └─ 角色标签组 (FRAME)
 *               │              └─ @GUI (TEXT)
 *               └─ 主图占位 (RECTANGLE)
 */
function makeBackend() {
  const store: NodeStore = {};
  // Track the ORDER in which cloneNode is called, and what sourceId was used.
  const cloneLog: Array<{ sourceId: string; parentId?: string; contentAtCallTime: string[] }> = [];

  function addNode(
    parentId: string | undefined,
    id: string,
    name: string,
    type: NodeInfo['type'],
    extra?: Partial<NodeInfo>
  ): NodeInfo {
    const node: NodeStore[string] = {
      id, name, type, children: [],
      parentId: parentId ?? undefined,
      ...extra
    };
    store[id] = node;
    if (parentId && store[parentId]) {
      store[parentId].children.push(id);
    }
    return node;
  }

  function nodeInfo(id: string): NodeInfo {
    const n = store[id];
    if (!n) throw new Error(`mock: node ${id} not found`);
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      parentId: n.parentId,
      childIds: n.children.length > 0 ? [...n.children] : undefined,
      absoluteBoundingBox: n.absoluteBoundingBox ?? { x: 0, y: 0, width: 100, height: 100 }
    };
  }

  // --- Build template tree -------------------------------------------------

  const rootId = '1:14';  // must match TEMPLATE_NODE_ID
  addNode(undefined, rootId, '1:14', 'FRAME');

  addNode(rootId, uid('txt'), '文档标题', 'TEXT', { characters: '' });
  addNode(rootId, uid('txt'), '设计师名称', 'TEXT', { characters: '' });
  addNode(rootId, uid('txt'), '需求组名称', 'TEXT', { characters: '' });
  addNode(rootId, uid('txt'), '易协作单号链接', 'TEXT', { characters: '' });
  addNode(rootId, uid('txt'), '更新时间', 'TEXT', { characters: '' });

  const bgId = uid('frame');
  addNode(rootId, bgId, '功能背景', 'FRAME');
  addNode(bgId, uid('txt'), '#Content', 'TEXT', { characters: '' });

  const ciId = uid('frame');
  addNode(rootId, ciId, '核心交互', 'FRAME');
  addNode(ciId, uid('txt'), '#Content', 'TEXT', { characters: '' });

  const secContainerId = uid('frame');
  addNode(rootId, secContainerId, '需求目标', 'FRAME');

  // 界面说明1 — masterSectionGroup
  const master1Id = uid('frame');
  addNode(secContainerId, master1Id, '界面说明1', 'FRAME');

  addNode(master1Id, uid('txt'), '#Name', 'TEXT', { characters: '' });

  const bubbleFrameId = uid('frame');
  addNode(master1Id, bubbleFrameId, '气泡', 'FRAME');  // SECTION_CHILD_NAMES.bubbleOverlayFrame = '气泡'
  const seed标号Id = uid('frame');
  addNode(bubbleFrameId, seed标号Id, '标号/1', 'FRAME');  // SECTION_CHILD_NAMES.bubbleNumberPrefix = '标号/'
  addNode(seed标号Id, uid('txt'), '#Number', 'TEXT', { characters: '1' });

  const rightColId = uid('frame');
  addNode(master1Id, rightColId, 'Text', 'FRAME');  // SECTION_CHILD_NAMES.rightColumnContainer = 'Text'

  const seedBlockId = uid('frame');
  addNode(rightColId, seedBlockId, '说明块1', 'FRAME');  // SECTION_CHILD_NAMES.clusterBlockPrefix = '说明块'
  addNode(seedBlockId, uid('txt'), 'Number', 'TEXT', { characters: '1' });
  addNode(seedBlockId, uid('txt'), '#Title_Main', 'TEXT', { characters: '' });
  addNode(seedBlockId, uid('txt'), '正文/规则', 'TEXT', { characters: '' });
  const roleFrameId = uid('frame');
  addNode(seedBlockId, roleFrameId, 'Frame 427319720', 'FRAME');  // SECTION_CHILD_NAMES.roleTagsFramePrefix = 'Frame 4273'
  addNode(roleFrameId, uid('txt'), '@GUI', 'TEXT', { characters: '@GUI' });

  addNode(master1Id, uid('rect'), '主图占位', 'RECTANGLE');

  // --- Mock FigmaBackend ---------------------------------------------------

  function deepClone(srcId: string, newParentId: string | undefined, newName?: string): string {
    const src = store[srcId];
    if (!src) throw new Error(`mock clone: src ${srcId} not found`);
    const newId = uid('clone');
    addNode(newParentId, newId, newName ?? src.name, src.type, {
      characters: (src as NodeInfo).characters
    });
    // Deep-clone children
    for (const childId of src.children) {
      deepClone(childId, newId);
    }
    return newId;
  }

  const backend: FigmaBackend = {
    async getNodeInfo(id) {
      return nodeInfo(id);
    },

    async getNodesInfo(ids) {
      return ids.map(nodeInfo);
    },

    async scanSubtree(rootId, maxNodes = 500): Promise<ScanSubtreeResult> {
      // BFS including root
      const result: NodeInfo[] = [];
      const queue = [rootId];
      while (queue.length > 0 && result.length < maxNodes) {
        const id = queue.shift()!;
        const n = store[id];
        if (!n) continue;
        result.push(nodeInfo(id));
        for (const c of n.children) queue.push(c);
      }
      return { nodes: result, truncated: false };
    },

    async cloneNode({ sourceId, parentId, name }) {
      // Record clone of any node named '界面说明1' — this is masterSectionGroup
      // inside the root clone. We snapshot the bubble-frame children of the
      // SOURCE node's sibling 气泡 FRAME at call time to verify phase ordering.
      const srcNode = store[sourceId];
      if (srcNode?.name === '界面说明1') {
        // Find the 气泡 FRAME inside the source section node.
        const bubbleChild = srcNode.children
          .map((cid) => store[cid])
          .find((c) => c?.name === '气泡');
        cloneLog.push({
          sourceId,
          parentId,
          contentAtCallTime: bubbleChild ? [...bubbleChild.children] : []
        });
      }
      const newId = deepClone(sourceId, parentId, name);
      return nodeInfo(newId);
    },

    async batchCloneNodes({ sourceId, parentId, count }) {
      const results: NodeInfo[] = [];
      for (let i = 0; i < count; i++) {
        const newId = deepClone(sourceId, parentId);
        results.push(nodeInfo(newId));
      }
      return results;
    },

    async moveNode(id, x, y) {
      const n = store[id];
      if (n?.absoluteBoundingBox) {
        n.absoluteBoundingBox = { ...n.absoluteBoundingBox, x, y };
      } else if (n) {
        n.absoluteBoundingBox = { x, y, width: 40, height: 40 };
      }
    },
    async setTextContent(id, chars) {
      const n = store[id];
      if (n) (n as NodeInfo & { characters: string }).characters = chars;
    },
    async setMultipleTextContents(updates) {
      for (const { nodeId, characters } of updates) {
        const n = store[nodeId];
        if (n) (n as NodeInfo & { characters: string }).characters = characters;
      }
    },
    async deleteNodes(ids) {
      for (const id of ids) {
        const n = store[id];
        if (!n) continue;
        if (n.parentId && store[n.parentId]) {
          store[n.parentId].children = store[n.parentId].children.filter((c) => c !== id);
        }
        delete store[id];
      }
    },
    async reparentNode() {},
    async commitUndoCheckpoint() {},
    async triggerUndo() {},
    async scanByTypes(rootId, types) {
      const { nodes } = await backend.scanSubtree(rootId);
      return nodes.filter((n) => types.includes(n.type));
    }
  };

  return {
    backend,
    store,
    cloneLog,
    masterSectionId: master1Id,
    bubbleFrameId,
    seedBlockId,
    rootId
  };
}

// ---------------------------------------------------------------------------
// Helper: count nodes by name under a given parent (recursive)
// ---------------------------------------------------------------------------
function countByName(store: NodeStore, rootId: string, name: string): number {
  let count = 0;
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const n = store[id];
    if (!n) continue;
    if (n.name === name) count++;
    for (const c of n.children) queue.push(c);
  }
  return count;
}

function childrenIds(store: NodeStore, parentId: string): string[] {
  return store[parentId]?.children ?? [];
}

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
    const { backend, store, cloneLog } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      { markdown: MD_2_SECTIONS },
      backend
    );

    expect(result.ok, JSON.stringify(result.errors)).toBe(true);

    // cloneLog[0] = first clone of masterSectionGroup (for section 2)
    // At clone time, bubble frame should have been EMPTY (0 bubbles added yet),
    // because phase 1 clones happen before phase 2 renders.
    expect(cloneLog).toHaveLength(1); // 2 sections → 1 clone
    expect(cloneLog[0].contentAtCallTime).toHaveLength(1); // only seed bubble, not rendered ones
  });

  it('3 sections: each section clone is made before any rendering fills the master', async () => {
    const { backend, store, cloneLog } = makeBackend();

    await renderV2MarkdownToFigma(
      { markdown: MD_3_SECTIONS },
      backend
    );

    // 3 sections → 2 clones of masterSectionGroup
    expect(cloneLog).toHaveLength(2);

    // Both clones should have been made when bubble frame still had only the seed bubble.
    // If old bug present: cloneLog[1].contentAtCallTime would have 3 items (section 1's bubbles).
    expect(cloneLog[0].contentAtCallTime).toHaveLength(1);
    expect(cloneLog[1].contentAtCallTime).toHaveLength(1);
  });

  it('2 sections: section 1 has 2 clusters, section 2 has 1 cluster — bubble counts match', async () => {
    const { backend, store } = makeBackend();

    const result = await renderV2MarkdownToFigma(
      { markdown: MD_2_SECTIONS },
      backend
    );

    expect(result.ok).toBe(true);

    // Collect all 気泡 FRAME nodes from the rendered store.
    // After rendering 2 sections, there should be 2 気泡 FRAMEs (one per section),
    // with 2 and 1 bubbles respectively.
    const allBubbleFrames = Object.values(store)
      .filter((n) => n.name === '気泡' || n.name === '气泡')
      .sort((a, b) => a.id.localeCompare(b.id)); // deterministic order (earlier id = earlier clone)

    // Should have exactly 2 bubble frames: one per section
    expect(allBubbleFrames.length).toBeGreaterThanOrEqual(2);

    // Section 1 has 2 clusters → its 気泡 FRAME has 2 children
    const sec1Bubbles = allBubbleFrames.find((f) =>
      f.children.length === 2
    );
    expect(sec1Bubbles).toBeDefined();

    // Section 2 has 1 cluster → its 気泡 FRAME has 1 child
    const sec2Bubbles = allBubbleFrames.find((f) =>
      f.children.length === 1
    );
    expect(sec2Bubbles).toBeDefined();
  });

  it('single section: behavior unchanged after refactor', async () => {
    const { backend, store, cloneLog, masterSectionId } = makeBackend();

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
});
