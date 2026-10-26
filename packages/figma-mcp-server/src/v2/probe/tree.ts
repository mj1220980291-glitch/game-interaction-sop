/**
 * Lightweight tree for template probing.
 *
 * The probe reads a subtree in one RTT (`FigmaBackend.scanSubtree`) and needs
 * parent links, order and visibility to apply its structural rules. This module
 * turns the flat BFS array into that tree and offers the handful of predicates
 * the detectors share.
 */

import type { BoundingBox, FigmaNodeType, NodeInfo } from '../figma-client.js';

export interface ProbeNode {
  id: string;
  name: string;
  type: FigmaNodeType;
  children: ProbeNode[];
  parent?: ProbeNode;
  /** Undefined in input = visible. */
  visible: boolean;
  box?: BoundingBox;
  /** TEXT only. */
  characters?: string;
  depth: number;
}

export interface ProbeTree {
  root: ProbeNode;
  byId: Map<string, ProbeNode>;
  /** True when the backend hit its node budget — verdicts must be downgraded. */
  truncated: boolean;
}

/** Build the tree. Children keep the order reported by the backend. */
export function buildProbeTree(nodes: NodeInfo[], rootId: string, truncated = false): ProbeTree | undefined {
  const byId = new Map<string, ProbeNode>();
  const raw = new Map<string, NodeInfo>();
  for (const n of nodes) {
    raw.set(n.id, n);
    byId.set(n.id, {
      id: n.id,
      name: n.name,
      type: n.type,
      children: [],
      visible: n.visible !== false,
      box: n.absoluteBoundingBox,
      characters: n.characters,
      depth: 0
    });
  }
  const root = byId.get(rootId);
  if (!root) return undefined;

  for (const n of nodes) {
    const node = byId.get(n.id);
    if (!node) continue;
    for (const childId of n.childIds ?? []) {
      const child = byId.get(childId);
      if (!child) continue;
      child.parent = node;
      node.children.push(child);
    }
  }

  const assignDepth = (node: ProbeNode, depth: number): void => {
    node.depth = depth;
    for (const c of node.children) assignDepth(c, depth + 1);
  };
  assignDepth(root, 0);
  void raw;
  return { root, byId, truncated };
}

export function walk(node: ProbeNode, visit: (n: ProbeNode) => boolean | void): void {
  if (visit(node) === false) return;
  for (const c of node.children) walk(c, visit);
}

export function descendants(node: ProbeNode): ProbeNode[] {
  const out: ProbeNode[] = [];
  walk(node, (n) => {
    if (n !== node) out.push(n);
  });
  return out;
}

/**
 * Structural walk: INSTANCE is a leaf.
 *
 * Library instances carry their own layout (a `Slide 16:9` holds a background
 * rect plus text groups), which would otherwise look exactly like a chapter.
 * Document structure lives *outside* instances, so every structural rule walks
 * with this visitor. Instance internals are still readable via `texts()` for
 * the one case that needs them — the number badge inside a `num` instance.
 */
export function walkStructured(node: ProbeNode, visit: (n: ProbeNode) => boolean | void): void {
  if (visit(node) === false) return;
  if (node.type === 'INSTANCE') return;
  for (const c of node.children) walkStructured(c, visit);
}

export function structuredDescendants(node: ProbeNode): ProbeNode[] {
  const out: ProbeNode[] = [];
  walkStructured(node, (n) => {
    if (n !== node) out.push(n);
  });
  return out;
}

export function texts(node: ProbeNode): ProbeNode[] {
  return descendants(node).filter((n) => n.type === 'TEXT');
}

export function isText(n: ProbeNode): boolean {
  return n.type === 'TEXT';
}

/** Digits-only TEXT (1–3 chars) — how both real templates carry a badge number. */
export function isNumberText(n: ProbeNode): boolean {
  if (n.type !== 'TEXT') return false;
  const s = (n.characters ?? '').trim();
  return /^\d{1,3}$/.test(s);
}

/** `@GUI` / `@程序` style role text. */
export function isRoleText(n: ProbeNode): boolean {
  if (n.type !== 'TEXT') return false;
  return /^@\S{1,6}$/.test((n.characters ?? '').trim());
}

/** Texts carrying `@角色` inside a sentence (inline-suffix habit). */
export function hasInlineRoleMention(n: ProbeNode): boolean {
  if (n.type !== 'TEXT') return false;
  const s = n.characters ?? '';
  return s.trim() !== '' && !/^@\S+$/.test(s.trim()) && /@[\u4e00-\u9fa5A-Za-z]{1,6}/.test(s);
}

/**
 * Structural signature used to decide whether two units are "the same shape".
 * Type sequence + child counts + name set + bucketed size. Text is excluded so
 * a copy with different wording still matches.
 */
export function shapeSignature(node: ProbeNode, opts: { depth?: number; withNames?: boolean } = {}): string {
  const maxDepth = opts.depth ?? 3;
  const withNames = opts.withNames ?? true;
  const parts: string[] = [];
  const visit = (n: ProbeNode, d: number): void => {
    if (d > maxDepth) return;
    const size = n.box ? `${bucket(n.box.width)}x${bucket(n.box.height)}` : '-';
    parts.push(`${n.type}:${n.children.length}:${size}${withNames ? `:${bucketName(n.name)}` : ''}`);
    for (const c of n.children) visit(c, d + 1);
  };
  visit(node, 0);
  return parts.join('|');
}

/** Coarse size bucket: 0 = tiny, 1 = small, 2 = medium, 3 = large, 4 = huge. */
export function bucket(v: number): number {
  if (!Number.isFinite(v)) return -1;
  if (v < 40) return 0;
  if (v < 200) return 1;
  if (v < 600) return 2;
  if (v < 1400) return 3;
  return 4;
}

/** Keep the leading token of a name so `Frame 1243` / `Frame 1245` match. */
function bucketName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ');
  const m = /^([^\d]{1,8})/.exec(normalized);
  return (m?.[1] ?? '').trim();
}

/** Does this node's subtree contain any graphic (image-ish) node? */
export function containsGraphic(node: ProbeNode): boolean {
  let found = false;
  walk(node, (n) => {
    if (found) return false;
    if (n.type === 'RECTANGLE' || n.type === 'INSTANCE') {
      const w = n.box?.width ?? 0;
      if (w >= 300) found = true;
    } else if (n.type === 'GROUP') {
      const w = n.box?.width ?? 0;
      if (w >= 600) found = true;
    }
    return undefined;
  });
  return found;
}

/** Does this node's subtree look like a text column? */
export function containsTextZone(node: ProbeNode, minTexts = 4): boolean {
  return texts(node).filter((t) => (t.characters ?? '').trim() !== '').length >= minTexts;
}
