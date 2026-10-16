/**
 * In-memory view of a `readStampedTree` result.
 */

import type { StampedNodeRaw, StampedTree } from '../figma-client.js';
import { parseStamp, type Stamp } from './stamp.js';

export interface TNode extends StampedNodeRaw {
  parsed?: Stamp;
}

export class Tree {
  readonly byId = new Map<string, TNode>();
  readonly rootId: string;
  readonly pageId?: string;
  readonly strayScratchIds: string[];

  constructor(raw: StampedTree, rootId: string) {
    for (const n of raw.nodes) {
      this.byId.set(n.id, { ...n, parsed: parseStamp(n.stamp) });
    }
    this.rootId = rootId;
    this.pageId = raw.pageId;
    this.strayScratchIds = raw.strayScratchIds;
  }

  get(id: string | undefined): TNode | undefined {
    return id === undefined ? undefined : this.byId.get(id);
  }

  get root(): TNode {
    const r = this.byId.get(this.rootId);
    if (!r) throw new Error(`tree: root ${this.rootId} missing`);
    return r;
  }

  children(id: string): TNode[] {
    const n = this.byId.get(id);
    if (!n) return [];
    const out: TNode[] = [];
    for (const c of n.childIds) {
      const cn = this.byId.get(c);
      if (cn) out.push(cn);
    }
    return out;
  }

  /** Breadth-first search under (and including) `fromId`. */
  find(fromId: string, pred: (n: TNode) => boolean): TNode | undefined {
    const queue = [fromId];
    let head = 0;
    while (head < queue.length) {
      const n = this.byId.get(queue[head++]!);
      if (!n) continue;
      if (pred(n)) return n;
      queue.push(...n.childIds);
    }
    return undefined;
  }

  findAll(fromId: string, pred: (n: TNode) => boolean): TNode[] {
    const out: TNode[] = [];
    const queue = [fromId];
    let head = 0;
    while (head < queue.length) {
      const n = this.byId.get(queue[head++]!);
      if (!n) continue;
      if (pred(n)) out.push(n);
      queue.push(...n.childIds);
    }
    return out;
  }

  /** First IMAGE fill hash in the subtree, pre-order — same rule as `stampNodes`. */
  subtreeHash(id: string): string | null {
    const n = this.byId.get(id);
    if (!n) return null;
    if (n.imageHash) return n.imageHash;
    for (const c of n.childIds) {
      const h = this.subtreeHash(c);
      if (h) return h;
    }
    return null;
  }

  /** True when `id` is `ancestorId` or lies somewhere under it. */
  isDescendantOf(id: string, ancestorId: string): boolean {
    let cur = this.byId.get(id);
    while (cur) {
      if (cur.id === ancestorId) return true;
      cur = cur.parentId ? this.byId.get(cur.parentId) : undefined;
    }
    return false;
  }
}
