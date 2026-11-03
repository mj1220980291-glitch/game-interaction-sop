/**
 * In-memory backend for multi-part render tests.
 *
 * Mirrors the real plugin's important behaviours:
 *   - `importComponentByKeyAsync` = deep clone of the registered component tree
 *   - `detachInstance` returns a NEW id (renderer must re-resolve slots)
 *   - `cloneNode` deep-clones, `deleteNodes` cascades
 *
 * Spec: template-render（拼�?/ 清空 / 布局�? */

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
  layoutMode?: NodeInfo['layoutMode'];
}

export interface PartsBackend {
  backend: FigmaBackend;
  nodes: Map<string, PNode>;
  calls: string[];
  /** `setTextRangeFills` 的调用记录：nodeId → 区间（用于校验 @职能 上色）。 */
  rangeFills: Map<string, Array<{ start: number; end: number; color: string }>>;
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
  x?: number;
  y?: number;
  fills?: string[];
  layoutMode?: NodeInfo['layoutMode'];
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
      x: s.x ?? 0,
      y: s.y ?? 0,
      ...(s.fills ? { fills: s.fills } : {}),
      ...(s.layoutMode ? { layoutMode: s.layoutMode } : {})
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
  const rangeFills = new Map<string, Array<{ start: number; end: number; color: string }>>();
  const components = new Map<string, PNodeSpec>();
  let seq = 0;
  /** 配图槽克隆计数：用来复现「第 N 张 y 越累越深」的真机症状。 */
  let figureCloneSeq = 0;
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

  /** 配图槽归一：单槽版，`normalizeFigureSlot` 与批量的 `normalizeFigureSlots` 共用。 */
  const normalizeSlot = (
    groupId: string,
    opts: {
      sourceGroupId?: string;
      rectName?: string;
      hintName?: string;
      gap?: number;
      minRectHeight?: number;
    } = {}
  ) => {
    const rectName = opts.rectName ?? '配图占位';
    const hintName = opts.hintName ?? '配图占位文案';
    let gap = opts.gap ?? 16;
    const group = nodes.get(groupId);
    if (!group) return undefined;
    const rect = byName(groupId, rectName)[0];
    if (!rect) return undefined;
    const hint = byName(groupId, hintName)[0];
    if (hint && opts.sourceGroupId) {
      const sRect = byName(opts.sourceGroupId, rectName)[0];
      const sHint = byName(opts.sourceGroupId, hintName)[0];
      if (sRect && sHint) {
        const measured = Math.round(sHint.y - (sRect.y + sRect.height));
        if (Number.isFinite(measured)) gap = Math.max(0, Math.min(measured, 64));
      }
    }
    const autoLayout = Boolean(group.layoutMode && group.layoutMode !== 'NONE');
    // 真机语义：GROUP 的子节点坐标写在「组所在父级」的坐标系里，FRAME 才是 0 基局部。
    const isGroup = group.type === 'GROUP';
    const ox = group.x;
    const oy = group.y;
    if ((opts.minRectHeight ?? 0) > 0 && rect.height < opts.minRectHeight!) {
      rect.height = Math.max(rect.height, opts.minRectHeight!);
    }
    if (!autoLayout) {
      rect.x = isGroup ? ox : 0;
      rect.y = isGroup ? oy : 0;
    }
    if (hint) {
      hint.width = Math.max(rect.width, 1);
      if (!autoLayout) {
        hint.x = rect.x;
        hint.y = Math.round(rect.y + rect.height + gap);
      }
    }
    if (!autoLayout && !isGroup) {
      group.width = Math.max(rect.width, hint?.width ?? 0, 1);
      group.height = Math.round(rect.height + (hint ? gap + hint.height : 0));
    }
    // GROUP 的 bbox 由子节点决定（真机上改子节点即自动贴合），这里同样重算。
    if (isGroup) {
      const kids = childrenOf(group.id);
      if (kids.length > 0) {
        const left = Math.min(...kids.map((k) => k.x));
        const top = Math.min(...kids.map((k) => k.y));
        const right = Math.max(...kids.map((k) => k.x + k.width));
        const bottom = Math.max(...kids.map((k) => k.y + k.height));
        group.x = Math.round(left);
        group.y = Math.round(top);
        group.width = Math.max(Math.round(right - left), 1);
        group.height = Math.max(Math.round(bottom - top), 1);
      }
    }
    const box = (n: PNode) => ({ x: n.x, y: n.y, width: n.width, height: n.height });
    return {
      groupId,
      groupWidth: group.width,
      groupHeight: group.height,
      rectX: rect.x,
      rectY: rect.y,
      rectWidth: rect.width,
      rectHeight: rect.height,
      ...(hint ? { hintX: hint.x, hintY: hint.y, hintWidth: hint.width, hintHeight: hint.height } : {}),
      groupAbs: box(group),
      rectAbs: box(rect),
      ...(hint ? { hintAbs: box(hint) } : {}),
      autoLayout
    };
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
      ...(n.layoutMode ? { layoutMode: n.layoutMode } : {}),
      ...(n.fills?.some((f) => f === 'image') ? { hasImageFill: true } : {}),
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
      x: spec.x ?? 0,
      y: spec.y ?? 0,
      ...(spec.fills ? { fills: [...spec.fills] } : {}),
      ...(spec.layoutMode ? { layoutMode: spec.layoutMode } : {})
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
      const copy = deepClone(sourceId, parentId, name);
      // 真机（2026-11-02）：克隆出的配图槽不会重新结算布局，`配图占位` 的 y 沿
      // 文档流累加、整组溢出簇框。这里复现这个症状，几何归一是唯一的修复路径。
      const rect = byName(copy.id, '配图占位')[0];
      if (rect) {
        figureCloneSeq += 1;
        rect.y += 800 * figureCloneSeq;
      }
      return info(copy.id);
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
    async fillFigurePlaceholder({
      groupId,
      rectId,
      hintId,
      maxWidth
    }: {
      groupId: string;
      rectId: string;
      hintId?: string;
      sourceNodeId?: string;
      maxWidth?: number;
    }) {
      calls.push(`fillFigure:${groupId}`);
      const rect = nodes.get(rectId);
      if (!rect) throw new Error(`parts backend: fill target ${rectId} not found`);
      const group = nodes.get(groupId);
      // 源图按 16:9 假尺寸处理：只关心「填图后槽是矩形高、文案已删」。
      const width = Math.min(Math.max(maxWidth ?? 1231, 1), 1231);
      const height = Math.round((width * 9) / 16);
      rect.width = width;
      rect.height = height;
      rect.fills = ['image'];
      if (hintId) remove(hintId);
      // 真机症状：贴完图的槽被压成个位数高度（图片等于看不见）。收尾归一必须救回来。
      rect.height = 5;
      if (group && (!group.layoutMode || group.layoutMode === 'NONE') && group.type !== 'GROUP') {
        group.height = 5;
      }
      return { width, height };
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
    async normalizeFigureSlot({
      groupId,
      sourceGroupId,
      rectName,
      hintName,
      gap
    }: {
      groupId: string;
      sourceGroupId?: string;
      rectName?: string;
      hintName?: string;
      gap?: number;
    }) {
      calls.push(`normalizeFigure:${groupId}`);
      const out = normalizeSlot(groupId, {
        ...(sourceGroupId ? { sourceGroupId } : {}),
        ...(rectName ? { rectName } : {}),
        ...(hintName ? { hintName } : {}),
        ...(gap !== undefined ? { gap } : {})
      });
      if (!out) throw new Error(`parts backend: normalize target ${groupId} not found`);
      return out;
    },
    async normalizeFigureSlots({
      groups,
      rectName,
      hintName,
      gap,
      minRectHeight
    }: {
      groups: Array<{ groupId: string }>;
      rectName?: string;
      hintName?: string;
      gap?: number;
      minRectHeight?: number;
    }) {
      calls.push(`normalizeFigures:${groups.length}`);
      return groups.map((g) => {
        const out = normalizeSlot(g.groupId, {
          ...(rectName ? { rectName } : {}),
          ...(hintName ? { hintName } : {}),
          ...(gap !== undefined ? { gap } : {}),
          ...(minRectHeight !== undefined ? { minRectHeight } : {})
        });
        return out ?? { groupId: g.groupId, missing: true };
      });
    },
    async setTextRangeFills(
      updates: Array<{ nodeId: string; ranges: Array<{ start: number; end: number; color: string }> }>
    ) {
      calls.push(`rangeFills:${updates.length}`);
      for (const u of updates) rangeFills.set(u.nodeId, u.ranges);
    },
    async normalizeChapterLayout({ chapterId }: { chapterId: string }) {
      calls.push(`normalizeChapter:${chapterId}`);
      const root = nodes.get(chapterId);
      if (!root) return { ok: false, reason: 'chapter not found', align: null, rootHeight: 0, stretched: [] };
      if (!root.layoutMode || root.layoutMode === 'NONE') {
        return { ok: false, reason: 'not auto-layout', align: null, rootHeight: root.height, stretched: [] };
      }
      // 真机上根是 HUG，改完子级 Figma 自己重算高度；假后端没有布局引擎，
      // 只把子级高度改回内容高，根高保持不动（调用方的断言依赖这一点）。
      const stretched: Array<Record<string, unknown>> = [];
      for (const id of root.children) {
        const child = nodes.get(id);
        if (!child?.layoutMode || child.layoutMode === 'NONE') continue;
        const wasStretched = Math.abs(child.height - root.height) <= 1;
        child.height = Math.max(...childrenOf(child.id).map((k) => k.y + k.height), 1);
        if (wasStretched) stretched.push({ id: child.id, name: child.name });
      }
      return { ok: true, align: 'MIN', rootHeight: root.height, stretched };
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
    async setMultipleTextContents(
      updates: Array<{
        nodeId: string;
        characters: string;
        align?: 'LEFT' | 'CENTER' | 'RIGHT';
        autoResize?: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT';
      }>
    ) {
      let alignNormalized = 0;
      for (const u of updates) {
        const n = nodes.get(u.nodeId);
        if (!n) continue;
        n.characters = u.characters;
        if (u.align) {
          const prev = (n as { textAlignHorizontal?: string }).textAlignHorizontal;
          if (prev && prev !== u.align) alignNormalized += 1;
          (n as { textAlignHorizontal?: string }).textAlignHorizontal = u.align;
        }
        if (u.autoResize) (n as { textAutoResize?: string }).textAutoResize = u.autoResize;
      }
      return { boldUnavailable: [] as string[], alignNormalized };
    },
    async deleteNodes(ids: string[]) {
      calls.push(`delete:${ids.length}`);
      for (const id of ids) remove(id);
    },
    async commitUndoCheckpoint() {},
    async triggerUndo() {},
    async setPluginData() {},
    async placeInstance({ sourceId, placeholderId }: { sourceId: string; placeholderId: string }) {
      calls.push(`placeInstance:${sourceId}->${placeholderId}`);
      const ph = nodes.get(placeholderId);
      const parent = ph?.parentId ? nodes.get(ph.parentId) : undefined;
      if (!ph || !parent) throw new Error(`parts backend: placeholder ${placeholderId} not found`);
      const idx = parent.children.indexOf(placeholderId);
      const inst = deepClone(sourceId, parent.id, ph.name);
      // 与真实后端一致：插回占位原索引，而不是追加到末尾。
      parent.children = parent.children.filter((c) => c !== inst.id);
      parent.children.splice(Math.max(idx, 0), 0, inst.id);
      remove(placeholderId);
      return info(inst.id);
    },
    async setImageFill({ nodeId, src }: { nodeId: string; src: string }) {
      calls.push(`setImageFill:${nodeId}`);
      const n = nodes.get(nodeId);
      if (n) n.fills = [`IMAGE:${src}`];
    },
    async renameNode(nodeId: string, name: string) {
      const n = nodes.get(nodeId);
      if (n) n.name = name;
    }
  } as unknown as FigmaBackend;

  return {
    backend,
    nodes,
    calls,
    rangeFills,
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
