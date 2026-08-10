/**
 * Shared in-memory FigmaBackend mock for render tests.
 *
 * The tree mirrors the real 1:14 template closely enough that renderInner
 * can walk it end to end, including the details that have caused bugs:
 *   - 气泡 FRAME ships TWO seeds, [标号/2, 标号/1], in that order
 *   - 说明块 ships TWO `#Title` sub-heading slots
 *   - 说明块 ships a 配图 GROUP with a 配图占位文案 TEXT inside
 */

import type {
  FigmaBackend,
  NodeInfo,
  ScanSubtreeResult
} from '../../../src/v2/figma-client.js';

let _uid = 1;
const uid = (prefix = 'n') => `${prefix}-${_uid++}`;

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
 *               │    └─ 说明块1 (FRAME)
 *               │         ├─ Number (TEXT)
 *               │         ├─ #Title_Main (TEXT)
 *               │         ├─ #Title (TEXT) ×2
 *               │         ├─ 正文/规则 (TEXT)
 *               │         ├─ Frame 427319720 (FRAME) └─ @GUI (TEXT)
 *               │         └─ 配图 (GROUP) └─ 配图占位文案 (TEXT)
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

  const seedBlockId = uid('frame');
  addNode(rightColId, seedBlockId, '说明块1', 'FRAME');
  addNode(seedBlockId, uid('txt'), 'Number', 'TEXT', { characters: '1' });
  addNode(seedBlockId, uid('txt'), '#Title_Main', 'TEXT', { characters: '' });
  addNode(seedBlockId, uid('txt'), '#Title', 'TEXT', { characters: '小标题1' });
  addNode(seedBlockId, uid('txt'), '#Title', 'TEXT', { characters: '小标题2' });
  addNode(seedBlockId, uid('txt'), '正文/规则', 'TEXT', { characters: '' });
  const roleFrameId = uid('frame');
  addNode(seedBlockId, roleFrameId, 'Frame 427319720', 'FRAME');
  addNode(roleFrameId, uid('txt'), '@GUI', 'TEXT', { characters: '@GUI' });
  const imageGroupId = uid('group');
  addNode(seedBlockId, imageGroupId, '配图', 'GROUP');
  addNode(imageGroupId, uid('txt'), '配图占位文案', 'TEXT', { characters: '配图占位' });

  addNode(master1Id, uid('rect'), '主图占位', 'RECTANGLE');

  // --- Mock FigmaBackend ---------------------------------------------------

  function deepClone(srcId: string, newParentId: string | undefined, newName?: string): string {
    const src = store[srcId];
    if (!src) throw new Error(`mock clone: src ${srcId} not found`);
    const newId = uid('clone');
    addNode(newParentId, newId, newName ?? src.name, src.type, {
      characters: (src as NodeInfo).characters
    });
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
