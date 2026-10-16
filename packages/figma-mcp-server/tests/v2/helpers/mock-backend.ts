/**
 * Shared in-memory FigmaBackend mock for render tests.
 *
 * The tree mirrors the real 1:14 template closely enough that renderInner
 * can walk it end to end, including the details that have caused bugs:
 *   - 气泡 FRAME ships TWO seeds, [标号/2, 标号/1], in that order
 *   - 说明块 is a 标题 header followed by TWO repeating SLOT RUNs, each
 *     being `#Title + Frame 4273xxx + 正文/规则×2 + 配图`
 *   - the number badge lives at 标题 › 序号 › 交互说明标记 › Number, next to
 *     a `Base` VECTOR that draws the blue circle. Anything that "removes the
 *     badge" by deleting only the Number TEXT leaves an empty circle behind,
 *     so the VECTOR has to be present here for tests to catch that.
 *   - 说明块02 ships WITHOUT any 配图 (verbatim from the real template)
 *
 * Verified against the live template on 2026-08-11 via figma_execute.
 */

import type {
  ApplyOpsResult,
  CropRect,
  FigmaBackend,
  NodeInfo,
  ReconcileOp,
  ScanSubtreeResult,
  StampedNodeRaw,
  StampedTree
} from '../../../src/v2/figma-client.js';
import { SCRATCH_ROOT_NAME } from '../../../src/v2/reconcile/stamp.js';

let _uid = 1;
const uid = (prefix = 'n') => `${prefix}-${_uid++}`;

/** Width of a 说明块 in the real 1:14 template (= max 配图 width). */
export const BLOCK_WIDTH = 1231;

/** The 7 role TEXTs every `Frame 4273xxx` ships with, in template order. */
const ROLE_TEXTS = [
  '@GUI',
  '@程序',
  '@拼接',
  '@动效',
  '@美术',
  '@策划',
  '@音频'
] as const;

export interface NodeStore {
  [id: string]: NodeInfo & {
    children: string[];
    absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  };
}

export interface CloneLogEntry {
  sourceId: string;
  parentId?: string;
  contentAtCallTime: string[];
}

/**
 * Build a minimal FigmaBackend backed by an in-memory node store.
 *
 *   root (FRAME, id '1:14')
 *     ├─ 文档标题 / 设计师名称 / 需求组名称 / 易协作单号链接 / 更新时间 (TEXT)
 *     ├─ 功能背景 (FRAME) └─ #Content (TEXT)
 *     ├─ 核心交互 (FRAME) └─ #Content (TEXT)
 *     └─ 需求目标 (FRAME)
 *          └─ 界面说明1 (FRAME)  ← masterSectionGroup
 *               ├─ #Name (TEXT)
 *               ├─ 气泡 (FRAME)
 *               │    ├─ 标号/2 (FRAME) └─ #Number (TEXT)
 *               │    └─ 标号/1 (FRAME) └─ #Number (TEXT)
 *               ├─ Text (FRAME)          ← right column, AUTO_LAYOUT
 *               │    ├─ 说明块01 (FRAME)
 *               │    │    ├─ 标题 (GROUP)
 *               │    │    │    ├─ 序号 (GROUP) └─ 交互说明标记 (FRAME)
 *               │    │    │    │                     ├─ Base (VECTOR)
 *               │    │    │    │                     └─ Number (TEXT)
 *               │    │    │    └─ #Title_Main (TEXT)
 *               │    │    ├─ #Title (TEXT) "小标题1"      ┐
 *               │    │    ├─ Frame 427319720 (FRAME)      │ slot run 1
 *               │    │    ├─ 正文/规则 (TEXT) ×2           │
 *               │    │    ├─ 配图 (GROUP)                  ┘
 *               │    │    ├─ #Title (TEXT) "小标题2"      ┐
 *               │    │    ├─ Frame 427319721 (FRAME)      │ slot run 2
 *               │    │    ├─ 正文/规则 (TEXT) ×2           │
 *               │    │    └─ 配图 (GROUP)                  ┘
 *               │    └─ 说明块02 (FRAME)   ← same shape, but NO 配图 at all
 *               └─ 主图占位 (RECTANGLE)
 */
export function makeBackend() {
  const store: NodeStore = {};
  const cloneLog: CloneLogEntry[] = [];

  function addNode(
    parentId: string | undefined,
    id: string,
    name: string,
    type: NodeInfo['type'],
    extra?: Partial<NodeInfo>
  ): NodeInfo {
    const node: NodeStore[string] = {
      id,
      name,
      type,
      children: [],
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
      // `characters` is what decideRoleKeepDelete matches on. Omitting it here
      // made every role tag look blank, so the renderer deleted all 7 — and no
      // test noticed, because none of them asserted on role tag content.
      characters: (n as NodeInfo).characters,
      childIds: n.children.length > 0 ? [...n.children] : undefined,
      absoluteBoundingBox: n.absoluteBoundingBox ?? { x: 0, y: 0, width: 100, height: 100 }
    };
  }

  // --- Build template tree -------------------------------------------------

  const rootId = '1:14'; // must match TEMPLATE_NODE_ID
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

  const master1Id = uid('frame');
  addNode(secContainerId, master1Id, '界面说明1', 'FRAME');

  addNode(master1Id, uid('txt'), '#Name', 'TEXT', { characters: '' });

  const bubbleFrameId = uid('frame');
  addNode(master1Id, bubbleFrameId, '气泡', 'FRAME');
  // Replicate real template 1:14: [标号/2 (first), 标号/1 (second)].
  // 标号/2 is picked by find(startsWith '标号/'); 标号/1 becomes orphan without the fix.
  const seedBubble2Id = uid('frame');
  addNode(bubbleFrameId, seedBubble2Id, '标号/2', 'FRAME');
  addNode(seedBubble2Id, uid('txt'), '#Number', 'TEXT', { characters: '2' });
  const seedBubble1Id = uid('frame');
  addNode(bubbleFrameId, seedBubble1Id, '标号/1', 'FRAME');
  addNode(seedBubble1Id, uid('txt'), '#Number', 'TEXT', { characters: '1' });

  const rightColId = uid('frame');
  addNode(master1Id, rightColId, 'Text', 'FRAME');

  /**
   * Build one 说明块 exactly like the real template: a 标题 header, then
   * `slotCount` repeating runs. `withImage` mirrors the real difference
   * between 说明块01 (配图 in every run) and 说明块02 (none at all).
   */
  function addBlock(
    name: string,
    badgeNumber: string,
    opts: { withImage: boolean; slotCount?: number }
  ): string {
    const blockId = uid('frame');
    addNode(rightColId, blockId, name, 'FRAME', {
      absoluteBoundingBox: { x: 0, y: 0, width: BLOCK_WIDTH, height: 800 }
    });

    const titleGroupId = uid('group');
    addNode(blockId, titleGroupId, '标题', 'GROUP');
    const numberGroupId = uid('group');
    addNode(titleGroupId, numberGroupId, '序号', 'GROUP');
    const badgeId = uid('frame');
    addNode(numberGroupId, badgeId, '交互说明标记', 'FRAME');
    addNode(badgeId, uid('vec'), 'Base', 'OTHER');
    addNode(badgeId, uid('txt'), 'Number', 'TEXT', { characters: badgeNumber });
    addNode(titleGroupId, uid('txt'), '#Title_Main', 'TEXT', { characters: '标题' });

    const slots = opts.slotCount ?? 2;
    for (let s = 1; s <= slots; s++) {
      addNode(blockId, uid('txt'), '#Title', 'TEXT', { characters: `小标题${s}` });
      const rf = uid('frame');
      addNode(blockId, rf, `Frame 42731972${s - 1}`, 'FRAME');
      for (const role of ROLE_TEXTS) {
        addNode(rf, uid('txt'), '职能标签/完整', 'TEXT', { characters: role });
      }
      addNode(blockId, uid('txt'), '正文/规则', 'TEXT', { characters: '说明文本' });
      addNode(blockId, uid('txt'), '正文/规则', 'TEXT', { characters: '说明文本' });
      if (opts.withImage) {
        const ig = uid('group');
        addNode(blockId, ig, '配图', 'GROUP');
        addNode(ig, uid('rect'), '配图占位', 'RECTANGLE');
        addNode(ig, uid('txt'), '配图占位文案', 'TEXT', {
          characters: '配图占位：待手动替换'
        });
      }
    }
    return blockId;
  }

  const seedBlockId = addBlock('说明块01', '1', { withImage: true });
  addBlock('说明块02', '2', { withImage: false });

  addNode(master1Id, uid('rect'), '主图占位', 'RECTANGLE');

  // --- Mock FigmaBackend ---------------------------------------------------

  function deepClone(srcId: string, newParentId: string | undefined, newName?: string): string {
    const src = store[srcId];
    if (!src) throw new Error(`mock clone: src ${srcId} not found`);
    const newId = uid('clone');
    const extra = src as NodeStore[string] & { stamp?: string; fill?: string };
    addNode(newParentId, newId, newName ?? src.name, src.type, {
      characters: (src as NodeInfo).characters,
      ...(src.absoluteBoundingBox ? { absoluteBoundingBox: { ...src.absoluteBoundingBox } } : {}),
      ...(extra.stamp ? { stamp: extra.stamp } : {}),
      ...(extra.fill ? { fill: extra.fill } : {})
    } as Partial<NodeInfo>);
    for (const childId of src.children) {
      deepClone(childId, newId);
    }
    return newId;
  }

  type Extra = NodeStore[string] & { stamp?: string; fill?: string };

  function ownHash(n: Extra): string | null {
    return n.fill?.startsWith('IMAGE:') ? n.fill : null;
  }

  function firstImageHash(id: string): string | null {
    const n = store[id] as Extra | undefined;
    if (!n) return null;
    const own = ownHash(n);
    if (own) return own;
    for (const c of n.children) {
      const h = firstImageHash(c);
      if (h) return h;
    }
    return null;
  }

  function detach(id: string): void {
    const n = store[id];
    if (n?.parentId && store[n.parentId]) {
      store[n.parentId].children = store[n.parentId].children.filter((c) => c !== id);
    }
  }

  function removeTree(id: string): void {
    const n = store[id];
    if (!n) return;
    for (const c of [...n.children]) removeTree(c);
    delete store[id];
  }

  /** Every applyOps batch, in order. */
  const opBatches: ReconcileOp[][] = [];
  /** Test hook: make applyOps fail once this many ops have been applied in total. */
  const faults: { failAfterOps?: number } = {};
  let opsAppliedTotal = 0;

  /** Every fillFigurePlaceholder call, in order. */
  const figureFills: Array<{
    sourceNodeId: string;
    groupId: string;
    crop?: CropRect;
    maxWidth: number;
    result: { width: number; height: number };
  }> = [];

  /**
   * Source nodes that fillFigurePlaceholder can export. Tests register them
   * with addSource; an unregistered id throws, like the real plugin.
   */
  function addSource(id: string, width: number, height: number): void {
    addNode(undefined, id, `源-${id}`, 'FRAME', {
      absoluteBoundingBox: { x: 0, y: 0, width, height }
    });
  }

  const backend: FigmaBackend = {
    async getNodeInfo(id) {
      return nodeInfo(id);
    },

    async getNodesInfo(ids) {
      return ids.map(nodeInfo);
    },

    async scanSubtree(rootId, maxNodes = 500): Promise<ScanSubtreeResult> {
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
      // Record clones of 界面说明1 (masterSectionGroup) with a snapshot of the
      // source's 气泡 children at call time, to verify phase ordering.
      const srcNode = store[sourceId];
      if (srcNode?.name === '界面说明1') {
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
    async rasterizeNodeToImageFill({ sourceNodeId, targetNodeId }) {
      if (!store[sourceNodeId]) {
        throw new Error(`rasterizeNodeToImageFill: source node not found: ${sourceNodeId}`);
      }
      const tgt = store[targetNodeId] as (NodeStore[string] & { fill?: string }) | undefined;
      if (!tgt) throw new Error(`rasterizeNodeToImageFill: target node not found: ${targetNodeId}`);
      tgt.fill = `IMAGE:${sourceNodeId}`;
    },
    async fillFigurePlaceholder({ sourceNodeId, groupId, rectId, hintId, crop, maxWidth }) {
      const src = store[sourceNodeId];
      if (!src?.absoluteBoundingBox) {
        throw new Error(`fillFigurePlaceholder: source node not found: ${sourceNodeId}`);
      }
      const rect = store[rectId];
      if (!store[groupId] || !rect) {
        throw new Error(`fillFigurePlaceholder: placeholder not found: group=${groupId} rect=${rectId}`);
      }
      const srcW = crop?.width ?? src.absoluteBoundingBox.width;
      const srcH = crop?.height ?? src.absoluteBoundingBox.height;
      const width = Math.min(srcW, maxWidth);
      const height = Math.round((srcH * width) / srcW);
      rect.absoluteBoundingBox = { x: 0, y: 0, width, height };
      (rect as NodeInfo & { fill?: string }).fill = `IMAGE:${sourceNodeId}`;
      if (hintId) await backend.deleteNodes([hintId]);
      const result = { width, height };
      figureFills.push({ sourceNodeId, groupId, crop, maxWidth, result });
      return result;
    },
    async commitUndoCheckpoint() {},
    async triggerUndo() {},
    async scanByTypes(rootId, types) {
      const { nodes } = await backend.scanSubtree(rootId);
      return nodes.filter((n) => types.includes(n.type));
    },

    async readStampedTree(rootId, maxNodes = 20000): Promise<StampedTree> {
      if (!store[rootId]) throw new Error(`readStampedTree: node ${rootId} not found`);
      const nodes: StampedNodeRaw[] = [];
      const queue = [rootId];
      let truncated = false;
      while (queue.length > 0) {
        if (nodes.length >= maxNodes) {
          truncated = true;
          break;
        }
        const id = queue.shift()!;
        const n = store[id] as Extra | undefined;
        if (!n) continue;
        const descend = n.type !== 'INSTANCE';
        nodes.push({
          id: n.id,
          name: n.name,
          type: n.type,
          parentId: n.parentId,
          childIds: descend ? [...n.children] : [],
          characters: n.type === 'TEXT' ? (n as NodeInfo).characters ?? '' : undefined,
          stamp: n.stamp || undefined,
          imageHash: ownHash(n),
          width: n.absoluteBoundingBox?.width
        });
        if (descend) queue.push(...n.children);
      }
      const strayScratchIds = Object.values(store)
        .filter((n) => !n.parentId && n.name === SCRATCH_ROOT_NAME)
        .map((n) => n.id);
      return { nodes, truncated, strayScratchIds };
    },

    async stampNodes(entries) {
      for (const e of entries) {
        const n = store[e.nodeId] as Extra | undefined;
        if (!n) continue;
        if (e.stamp === null) {
          n.stamp = undefined;
          continue;
        }
        const data: Record<string, unknown> = { ...e.stamp };
        if (e.captureHash) {
          const h = firstImageHash(e.nodeId);
          data['imageHash'] = h;
          if (!h) delete data['asset'];
        }
        n.stamp = JSON.stringify(data);
      }
    },

    async applyOps(ops): Promise<ApplyOpsResult> {
      opBatches.push(ops);
      let applied = 0;
      for (let i = 0; i < ops.length; i++) {
        if (faults.failAfterOps !== undefined && opsAppliedTotal >= faults.failAfterOps) {
          faults.failAfterOps = undefined;
          return { applied, failedAt: i, reason: 'mock: injected failure' };
        }
        const op = ops[i]!;
        const n = store[op.nodeId] as Extra | undefined;
        if (op.op === 'delete') {
          if (n) {
            detach(op.nodeId);
            removeTree(op.nodeId);
          }
        } else if (!n) {
          return { applied, failedAt: i, reason: `${op.op}: node not found: ${op.nodeId}` };
        } else if (op.op === 'setText') {
          (n as NodeInfo & { characters: string }).characters = op.text;
        } else if (op.op === 'stamp') {
          n.stamp = op.stamp === null ? undefined : JSON.stringify(op.stamp);
        } else {
          const p = store[op.parentId];
          if (!p) return { applied, failedAt: i, reason: `place: parent not found: ${op.parentId}` };
          detach(op.nodeId);
          const kids = p.children;
          let idx = 0;
          if (op.afterId) {
            const a = kids.indexOf(op.afterId);
            if (a < 0) return { applied, failedAt: i, reason: `place: anchor not found: ${op.afterId}` };
            idx = a + 1;
          }
          while (idx < kids.length && !(store[kids[idx]!] as Extra).stamp) idx++;
          kids.splice(idx, 0, op.nodeId);
          n.parentId = op.parentId;
        }
        applied++;
        opsAppliedTotal++;
      }
      return { applied };
    }
  };

  /** Simulate the designer pasting a loose image right after `afterId` in `parentId`. */
  function pasteForeign(parentId: string, afterId: string | null, name = 'image 45'): string {
    const id = uid('foreign');
    addNode(undefined, id, name, 'RECTANGLE');
    const kids = store[parentId]!.children;
    const idx = afterId ? kids.indexOf(afterId) + 1 : 0;
    kids.splice(idx, 0, id);
    store[id]!.parentId = parentId;
    return id;
  }

  return {
    backend,
    store,
    cloneLog,
    figureFills,
    opBatches,
    faults,
    addSource,
    pasteForeign,
    masterSectionId: master1Id,
    bubbleFrameId,
    seedBlockId,
    rightColId,
    rootId
  };
}

/** Count nodes with a given name anywhere under `rootId`. */
export function countByName(store: NodeStore, rootId: string, name: string): number {
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

/** Direct children ids of a node. */
export function childrenIds(store: NodeStore, parentId: string): string[] {
  return store[parentId]?.children ?? [];
}

/** Collect every live node under `rootId` matching `name`, in tree order. */
export function collectByName(store: NodeStore, rootId: string, name: string): NodeStore[string][] {
  const out: NodeStore[string][] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const n = store[id];
    if (!n) continue;
    if (n.name === name) out.push(n);
    for (const c of n.children) queue.push(c);
  }
  return out;
}
