/**
 * Minimal in-memory backend for slot-normalization tests.
 *
 * Only the three methods the normalizer uses are implemented (`getNodeInfo` /
 * `scanSubtree` / `renameNode`), plus a call log so tests can assert that
 * renaming never touches anything but names.
 *
 * Spec: template-compile「槽位命名归一化」
 */

import type { FigmaBackend, NodeInfo } from '../../../src/v2/figma-client.js';

export interface SlotsBackend {
  backend: FigmaBackend;
  renamed: Array<{ nodeId: string; name: string }>;
  writes: string[];
  store: Map<string, NodeInfo>;
}

export function slotsBackend(nodes: NodeInfo[]): SlotsBackend {
  const store = new Map(nodes.map((n) => [n.id, { ...n, childIds: [...(n.childIds ?? [])] }]));
  // 真机后端每个节点都带 parentId（扫描结果里有）；测试数据只写 childIds，
  // 这里补一层，免得「按父级分组隐藏」这类逻辑在测试里永远走空。
  for (const node of store.values()) {
    for (const childId of node.childIds ?? []) {
      const child = store.get(childId);
      if (child && !child.parentId) child.parentId = node.id;
    }
  }
  const renamed: Array<{ nodeId: string; name: string }> = [];
  const writes: string[] = [];

  const backend = {
    async getNodeInfo(id: string): Promise<NodeInfo> {
      const n = store.get(id);
      if (!n) throw new Error(`slots backend: node ${id} not found`);
      return n;
    },

    async getNodesInfo(ids: string[]): Promise<NodeInfo[]> {
      return ids.map((id) => {
        const n = store.get(id);
        if (!n) throw new Error(`slots backend: node ${id} not found`);
        return n;
      });
    },

    async scanSubtree(rootId: string) {
      const out: NodeInfo[] = [];
      const queue = [rootId];
      while (queue.length > 0) {
        const id = queue.shift()!;
        const n = store.get(id);
        if (!n) continue;
        out.push(n);
        for (const c of n.childIds ?? []) queue.push(c);
      }
      return { nodes: out, truncated: false };
    },

    async renameNode(id: string, name: string): Promise<void> {
      const n = store.get(id);
      if (!n) throw new Error(`slots backend: rename target ${id} not found`);
      n.name = name;
      renamed.push({ nodeId: id, name });
      writes.push(`rename:${id}`);
    },

    async deleteNodes(ids: string[]): Promise<void> {
      const remove = (id: string): void => {
        const n = store.get(id);
        if (!n) return;
        for (const child of n.childIds ?? []) remove(child);
        for (const parent of store.values()) {
          parent.childIds = (parent.childIds ?? []).filter((c) => c !== id);
        }
        store.delete(id);
      };
      for (const id of ids) {
        remove(id);
        writes.push(`delete:${id}`);
      }
    },

    async setNodeVisible(id: string, visible: boolean): Promise<void> {
      const n = store.get(id);
      if (!n) throw new Error(`slots backend: visible target ${id} not found`);
      n.visible = visible;
      writes.push(`visible:${id}:${visible}`);
    },

    async setMultipleTextContents(
      updates: ReadonlyArray<{ nodeId: string; characters: string }>
    ): Promise<void> {
      for (const u of updates) {
        const n = store.get(u.nodeId);
        if (!n) throw new Error(`slots backend: text target ${u.nodeId} not found`);
        n.characters = u.characters;
        writes.push(`text:${u.nodeId}:${u.characters}`);
      }
    },

    async replaceWithPlaceholder(input: { nodeId: string; name: string }): Promise<void> {
      writes.push(`placeholder:${input.nodeId}:${input.name}`);
    },

    async moveNode(id: string, x: number, y: number): Promise<void> {
      const n = store.get(id);
      if (!n) throw new Error(`slots backend: move target ${id} not found`);
      n.x = x;
      n.y = y;
      if (n.absoluteBoundingBox) n.absoluteBoundingBox = { ...n.absoluteBoundingBox, x, y };
      writes.push(`move:${id}:${x}`);
    }
  } as unknown as FigmaBackend;

  return {
    backend,
    renamed,
    writes,
    store,
    childrenOf(id: string): NodeInfo[] {
      return (store.get(id)?.childIds ?? [])
        .map((c) => store.get(c))
        .filter((n): n is NodeInfo => n !== undefined);
    }
  };
}

/** NodeInfo shorthand for fixtures. */
export function n(
  id: string,
  name: string,
  type: NodeInfo['type'],
  children: string[] = [],
  opts: {
    text?: string;
    w?: number;
    h?: number;
    x?: number;
    y?: number;
    visible?: boolean;
    layoutMode?: NodeInfo['layoutMode'];
    hasImageFill?: boolean;
  } = {}
): NodeInfo {
  return {
    id,
    name,
    type,
    childIds: children,
    visible: opts.visible !== false,
    ...(opts.text !== undefined ? { characters: opts.text } : {}),
    ...(opts.layoutMode !== undefined ? { layoutMode: opts.layoutMode } : {}),
    ...(opts.hasImageFill !== undefined ? { hasImageFill: opts.hasImageFill } : {}),
    ...(opts.w !== undefined || opts.h !== undefined || opts.x !== undefined || opts.y !== undefined
      ? {
          x: opts.x ?? 0,
          y: opts.y ?? 0,
          absoluteBoundingBox: {
            x: opts.x ?? 0,
            y: opts.y ?? 0,
            width: opts.w ?? 100,
            height: opts.h ?? 100
          }
        }
      : {})
  };
}
