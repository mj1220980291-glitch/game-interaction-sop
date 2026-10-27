/**
 * In-memory backend for multi-part render tests.
 *
 * Mirrors the real plugin's important behaviours:
 *   - `importComponentByKeyAsync` = deep clone of the registered component tree
 *   - `detachInstance` returns a NEW id (renderer must re-resolve slots)
 *   - `cloneNode` deep-clones, `deleteNodes` cascades
 *
 * Spec: template-render（拼装 / 清空 / 布局）
 */

import type { FigmaBackend, NodeInfo } from '../../../src/v2/figma-client.js';

export interface PNode {
  id: string;
  name: string;
  type: NodeInfo['type'];
  children: string[];
  parentId?: string;
  characters?: string;
  visible?: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  fills?: string[];
}

export interface PartsBackend {
  backend: FigmaBackend;
  nodes: Map<string, PNode>;
  calls: string[];
  /** Register a part component that `importComponentByKey` can clone. */
  registerComponent(key: string, tree: PNode): void;
  childrenOf(id: string): PNode[];
  byName(rootId: string, name: string): PNode[];
  root(): PNode;
}

export interface PNodeSpec {
  id: string;
  name: string;
  type: NodeInfo['type'];
  children?: PNodeSpec[];
  characters?: string;
  visible?: boolean;
  width?: number;
  height?: number;
  fills?: string[];
}

export function buildNodes(rootId: string, spec: PNodeSpec): Map<string, PNode> {
  const map = new Map<string, PNode>();
  const visit = (s: PNodeSpec, parentId?: string): void => {
    map.set(s.id, {
      id: s.id,
      name: s.name,
      type: s.type,
      children: (s.children ?? []).map((c) => c.id),
      ...(parentId ? { parentId } : {}),
      ...(s.characters !== undefined ? { characters: s.characters } : {}),
      visible: s.visible !== false,
      width: s.width ?? 100,
      height: s.height ?? 100,
      x: 0,
      y: 0,
      ...(s.fills ? { fills: s.fills } : {})
    });
    for (const child of s.children ?? []) visit(child, s.id);
  };
  visit(spec);
  if (!map.has(rootId)) throw new Error(`buildNodes: root ${rootId} missing`);
  return map;
}

export function partsBackend(rootSpec: PNodeSpec): PartsBackend {
  const nodes = buildNodes(rootSpec.id, rootSpec);
  const calls: string[] = [];
  const components = new Map<string, PNodeSpec>();
  let seq = 0;
  const uid = (prefix: string): string => `${prefix}-${++seq}`;

  const childrenOf = (id: string): PNode[] =>
    (nodes.get(id)?.children ?? []).map((c) => nodes.get(c)!).filter(Boolean);

  const byName = (rootId: string, name: string): PNode[] => {
    const out: PNode[] = [];
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const n = nodes.get(id);
      if (!n) continue;
      if (n.name === name) out.push(n);
      queue.push(...n.children);
    }
    return out;
  };

  const detach = (id: string): void => {
    const n = nodes.get(id);
    if (!n?.parentId) return;
    const parent = nodes.get(n.parentId);
    if (parent) parent.children = parent.children.filter((c) => c !== id);
    n.parentId = undefined;
  };

  const remove = (id: string): void => {
    const n = nodes.get(id);
    if (!n) return;
    for (const c of [...n.children]) remove(c);
    if (n.parentId) {
      const parent = nodes.get(n.parentId);
      if (parent) parent.children = parent.children.filter((c) => c !== id);
    }
    nodes.delete(id);
  };

  const deepClone = (sourceId: string, parentId: string | undefined, name?: string): PNode => {
    const src = nodes.get(sourceId);
    if (!src) throw new Error(`parts backend: source ${sourceId} not found`);
    const copy: PNode = {
      ...src,
      id: uid(src.type.toLowerCase()),
      children: [],
      name: name ?? src.name,
      ...(parentId ? { parentId } : {})
    };
    nodes.set(copy.id, copy);
    if (parentId) nodes.get(parentId)?.children.push(copy.id);
    for (const childId of src.children) {
      deepClone(childId, copy.id);
    }
    return copy;
  };

  const info = (id: string): NodeInfo => {
    const n = nodes.get(id);
    if (!n) throw new Error(`parts backend: node ${id} not found`);
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      ...(n.parentId ? { parentId: n.parentId } : {}),
      visible: n.visible !== false,
      ...(n.characters !== undefined ? { characters: n.characters } : {}),
      ...(n.children.length > 0 ? { childIds: [...n.children] } : {}),
      absoluteBoundingBox: { x: n.x, y: n.y, width: n.width, height: n.height }
    };
  };

  const cloneSpec = (spec: PNodeSpec, parentId: string | undefined, name?: string): PNode => {
    const copy: PNode = {
      id: uid(spec.type.toLowerCase()),
      name: name ?? spec.name,
      type: spec.type,
      children: [],
      ...(parentId ? { parentId } : {}),
      ...(spec.characters !== undefined ? { characters: spec.characters } : {}),
      visible: spec.visible !== false,
      width: spec.width ?? 100,
      height: spec.height ?? 100,
      x: 0,
      y: 0,
      ...(spec.fills ? { fills: [...spec.fills] } : {})
    };
    nodes.set(copy.id, copy);
    if (parentId) nodes.get(parentId)?.children.push(copy.id);
    for (const child of spec.children ?? []) {
      cloneSpec(child, copy.id);
    }
    return copy;
  };

  const backend = {
    async getNodeInfo(id: string) {
      return info(id);
    },
    async getNodesInfo(ids: string[]) {
      return ids.map(info);
    },
    async scanSubtree(rootId: string, maxNodes = 5000) {
      const out: NodeInfo[] = [];
      const queue = [rootId];
      while (queue.length > 0 && out.length < maxNodes) {
        const id = queue.shift()!;
        if (!nodes.has(id)) continue;
        out.push(info(id));
        queue.push(...(nodes.get(id)!.children ?? []));
      }
      return { nodes: out, truncated: false };
    },
    async instantiateByKey({ componentKey, parentId, name }: { componentKey: string; parentId?: string; name?: string }) {
      calls.push(`import:${componentKey}`);
      const spec = components.get(componentKey);
      if (!spec) throw new Error(`parts backend: component ${componentKey} not registered`);
      return info(cloneSpec(spec, parentId, name).id);
    },
    async detachInstance(nodeId: string) {
      calls.push(`detach:${nodeId}`);
      const n = nodes.get(nodeId);
      if (!n) throw new Error(`parts backend: detach target ${nodeId} not found`);
      const copy = deepClone(nodeId, n.parentId, n.name);
      copy.type = 'FRAME';
      remove(nodeId);
      return info(copy.id);
    },
    async cloneNode({ sourceId, parentId, name }: { sourceId: string; parentId?: string; name?: string }) {
      calls.push(`clone:${sourceId}`);
      return info(deepClone(sourceId, parentId, name).id);
    },
    async batchCloneNodes({ sourceId, parentId, count }: { sourceId: string; parentId?: string; count: number }) {
      const out: NodeInfo[] = [];
      for (let i = 0; i < count; i += 1) out.push(info(deepClone(sourceId, parentId).id));
      return out;
    },
    async createFrame({ parentId, name, width, height }: { parentId?: string; name: string; width: number; height: number }) {
      calls.push(`createFrame:${name}`);
      const n: PNode = {
        id: uid('frame'),
        name,
        type: 'FRAME',
        children: [],
        ...(parentId ? { parentId } : {}),
        visible: true,
        width,
        height,
        x: 0,
        y: 0
      };
      nodes.set(n.id, n);
      if (parentId) nodes.get(parentId)?.children.push(n.id);
      return info(n.id);
    },
    async resizeNode(nodeId: string, width: number, height: number) {
      calls.push(`resize:${nodeId}`);
      const n = nodes.get(nodeId);
      if (n) {
        n.width = width;
        n.height = height;
      }
    },
    async reparentNode({ nodeId, newParentId }: { nodeId: string; newParentId: string }) {
      calls.push(`reparent:${nodeId}->${newParentId}`);
      const n = nodes.get(nodeId);
      if (!n) throw new Error(`parts backend: reparent target ${nodeId} not found`);
      if (n.parentId) {
        const old = nodes.get(n.parentId);
        if (old) old.children = old.children.filter((c) => c !== nodeId);
      }
      n.parentId = newParentId;
      nodes.get(newParentId)?.children.push(nodeId);
    },
    async moveNode(nodeId: string, x: number, y: number) {
      const n = nodes.get(nodeId);
      if (n) {
        n.x = x;
        n.y = y;
      }
    },
    async setNodeVisible(nodeId: string, visible: boolean) {
      const n = nodes.get(nodeId);
      if (n) n.visible = visible;
    },
    async clearFills(nodeIds: string[]) {
      calls.push(`clearFills:${nodeIds.length}`);
      for (const id of nodeIds) {
        const n = nodes.get(id);
        if (n) n.fills = [];
      }
    },
    async setTextContent(nodeId: string, characters: string) {
      const n = nodes.get(nodeId);
      if (n) n.characters = characters;
    },
    async setMultipleTextContents(updates: Array<{ nodeId: string; characters: string }>) {
      for (const u of updates) {
        const n = nodes.get(u.nodeId);
        if (n) n.characters = u.characters;
      }
      return { boldUnavailable: [] as string[] };
    },
    async deleteNodes(ids: string[]) {
      calls.push(`delete:${ids.length}`);
      for (const id of ids) remove(id);
    },
    async commitUndoCheckpoint() {},
    async triggerUndo() {},
    async setPluginData() {},
    async renameNode(nodeId: string, name: string) {
      const n = nodes.get(nodeId);
      if (n) n.name = name;
    }
  } as unknown as FigmaBackend;

  return {
    backend,
    nodes,
    calls,
    registerComponent(key: string, tree: PNodeSpec) {
      components.set(key, tree);
    },
    childrenOf,
    byName,
    root() {
      return [...nodes.values()].find((n) => !n.parentId)!;
    }
  };
}
