/**
 * Plan a sync: align the snapshot with the IR and decide, for every node,
 * whether to write, insert, move, delete or leave it alone.
 *
 * Pure: no backend calls. Nodes that have to come from a fresh render
 * (new sections, clusters, items, role frames) are referred to symbolically
 * (`ScratchRef`) and only resolved to ids once the scratch doc exists, so
 * `dryRun` never has to render anything.
 */

import type { DocIR, InterfaceSection, SemanticCluster } from '../ir.js';
import type { AssetSpec } from '../render.js';
import { alignSequences, type Step } from './align.js';
import { expectedItems, type ExpectedItem } from './layout.js';
import { roleTexts, type DocSnapshot, type SnapCluster, type SnapItem, type SnapSection } from './snapshot.js';
import type { TNode } from './tree.js';
import {
  HEADER_KEYS,
  OVERVIEW_KEYS,
  figureHintText,
  sameAsset,
  sameRoles,
  stripIndexPrefix,
  type ClusterStamp,
  type DocStamp,
  type ItemManifestEntry,
  type ItemStamp,
  type SlotStamp
} from './stamp.js';
import { SECTION_CHILD_NAMES } from '../template-map.js';
import { stateBoldLength } from '../state-line.js';

// --- Report types ----------------------------------------------------------

export interface ReconcileChange {
  path: string;
  action: 'update' | 'insert' | 'delete' | 'move' | 'renumber' | 'asset' | 'roles';
  detail?: string;
}

export interface ReconcileConflict {
  path: string;
  kind: 'text' | 'figure' | 'deleted-but-changed' | 'container-not-empty';
  figma?: string;
  markdown?: string;
  nodeId?: string;
}

export interface ReconcilePreserved {
  path: string;
  kind: 'hand-edit' | 'foreign' | 'designer-deleted';
  nodeId?: string;
  detail?: string;
}

// --- Plan types ------------------------------------------------------------

export interface ScratchRef {
  /** 0-based section index in the markdown. */
  s: number;
  c?: number;
  i?: number;
  part: 'section' | 'block' | 'item' | 'bubble' | 'roles';
}

export type Ref = string | ScratchRef;

export interface Resolver {
  id(ref: Ref): string;
  stampOf(ref: Ref): Record<string, unknown>;
}

export type PlanOp =
  | { op: 'setText'; nodeId: string; text: string; bold?: number }
  | { op: 'delete'; nodeId: string }
  | { op: 'place'; node: Ref; parentId: string; after: Ref | null }
  | { op: 'stamp'; node: Ref; stamp: (r: Resolver) => object };

export interface PlanBatch {
  key: string;
  ops: PlanOp[];
}

export type FillTask =
  | { kind: 'main'; path: string; nodeId: string; hintId?: string; asset: AssetSpec; stamp: SlotStamp }
  | {
      kind: 'figure';
      path: string;
      groupId: string;
      rectId?: string;
      hintId?: string;
      asset: Extract<AssetSpec, { type: 'figma_node' }>;
      maxWidth: number;
      stamp: ItemStamp;
    };

export interface Plan {
  changes: ReconcileChange[];
  conflicts: ReconcileConflict[];
  preserved: ReconcilePreserved[];
  /** 0-based markdown section indices the scratch render must contain. */
  scratchSections: number[];
  /** Containers' batches, innermost first; the doc stamp is NOT included. */
  batches: PlanBatch[];
  fills: FillTask[];
  /** Doc stamp to write at the end (without lock). */
  docStamp: (r: Resolver) => DocStamp;
  /** False when nothing at all needs writing. */
  hasWrites: boolean;
  /** Which batch (key) each change belongs to, so a failed run can report what landed. */
  changeBatch: Map<ReconcileChange, string>;
}

export type PlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; code: string; message: string };

export interface PlanOptions {
  scope?: string;
  assetMap?: Record<string, AssetSpec>;
}

const SCOPE_RE = /^(\d{2})(?:\/(\d+))?$/;
const FIGURE_MAX_WIDTH_FALLBACK = 1231;

// --- Planner ---------------------------------------------------------------

export function planReconcile(snap: DocSnapshot, ir: DocIR, opts: PlanOptions = {}): PlanResult {
  let scope: { s: number; c?: number } | undefined;
  if (opts.scope !== undefined) {
    const m = SCOPE_RE.exec(opts.scope);
    const s = m ? ir.sections.findIndex((x) => x.index === m[1]) : -1;
    if (!m || s < 0) {
      return { ok: false, code: 'V2_SCOPE_NOT_FOUND', message: `scope "${opts.scope}": no such section in the markdown` };
    }
    const c = m[2] !== undefined ? Number(m[2]) - 1 : undefined;
    if (c !== undefined && (c < 0 || c >= ir.sections[s]!.clusters.length)) {
      return { ok: false, code: 'V2_SCOPE_NOT_FOUND', message: `scope "${opts.scope}": no such cluster in the markdown` };
    }
    scope = { s, c };
  }

  const p = new Planner(snap, ir, opts.assetMap);
  const err = p.run(scope);
  if (err) return { ok: false, code: 'V2_SCOPE_NOT_FOUND', message: err };
  return { ok: true, plan: p.result() };
}

interface Seq<O> {
  old: O[];
  steps: Step[];
  deleted: number[];
}

class Planner {
  private changes: ReconcileChange[] = [];
  private conflicts: ReconcileConflict[] = [];
  private preserved: ReconcilePreserved[] = [];
  private scratch = new Set<number>();
  private batches: PlanBatch[] = [];
  private fills: FillTask[] = [];
  private changeBatch = new Map<ReconcileChange, string>();
  private currentBatch = 'doc';
  private docDirty = false;
  private docStampFn: (r: Resolver) => DocStamp = () => this.snap.stamp;

  constructor(
    private snap: DocSnapshot,
    private ir: DocIR,
    private assetMap: Record<string, AssetSpec> | undefined
  ) {}

  result(): Plan {
    const hasWrites =
      this.docDirty || this.fills.length > 0 || this.batches.some((b) => b.ops.length > 0);
    return {
      changes: this.changes,
      conflicts: this.conflicts,
      preserved: this.preserved,
      scratchSections: [...this.scratch].sort((a, b) => a - b),
      batches: this.batches.filter((b) => b.ops.length > 0),
      fills: this.fills,
      docStamp: this.docStampFn,
      hasWrites,
      changeBatch: this.changeBatch
    };
  }

  // --- reporting -----------------------------------------------------------

  private change(c: ReconcileChange): void {
    this.changes.push(c);
    this.changeBatch.set(c, this.currentBatch);
  }
  private conflict(c: ReconcileConflict): void {
    this.conflicts.push(c);
  }
  private keep(p: ReconcilePreserved): void {
    this.preserved.push(p);
  }
  private foreign(path: string, nodes: TNode[]): void {
    for (const n of nodes) this.keep({ path, kind: 'foreign', nodeId: n.id, detail: n.name });
  }

  /**
   * The D5 table for one text slot. Returns the new "last written" value.
   * `bold` (bullet rules only) rides along on the setText op; see
   * TextUpdate.bold. Weight is never compared — only characters are.
   */
  private text(path: string, node: TNode | undefined, W: string, M: string, ops: PlanOp[], bold?: number): string {
    if (W === M) {
      if (node && (node.characters ?? '') !== W) {
        this.keep({ path, kind: 'hand-edit', nodeId: node.id });
      }
      return W;
    }
    if (!node) {
      this.conflict({ path, kind: 'deleted-but-changed', markdown: M });
      return W;
    }
    const F = node.characters ?? '';
    if (F === W) {
      ops.push(bold === undefined ? { op: 'setText', nodeId: node.id, text: M } : { op: 'setText', nodeId: node.id, text: M, bold });
      this.change({ path, action: 'update' });
      return M;
    }
    if (F === M) return M;
    this.conflict({ path, kind: 'text', figma: F, markdown: M, nodeId: node.id });
    return W;
  }

  private align<O>(old: O[], oldKey: (o: O) => string, neu: string[], canPair?: (o: number, n: number) => boolean): Seq<O> {
    const a = alignSequences(old.map(oldKey), neu, canPair);
    return { old, steps: a.byNew, deleted: a.deleted };
  }

  // --- doc -----------------------------------------------------------------

  run(scope: { s: number; c?: number } | undefined): string | undefined {
    const { snap, ir } = this;
    const docOps: PlanOp[] = [];
    this.currentBatch = 'doc';

    const seq = this.align(
      snap.sections,
      (s) => s.W,
      ir.sections.map((s) => stripIndexPrefix(s.name))
    );

    if (scope) {
      const step = seq.steps[scope.s]!;
      const old = step.kind === 'insert' ? undefined : seq.old[step.o];
      if (!old?.node) {
        return `scope "${ir.sections[scope.s]!.index}": that section does not exist in the document yet`;
      }
      const sec = ir.sections[scope.s]!;
      this.currentBatch = `s:${old.sid}`;
      const nameW = this.text(`${sec.index}/#name`, old.nameNode, old.W, stripIndexPrefix(sec.name), docOps);
      const err = this.section(old, scope.s, scope.c, nameW, docOps);
      if (err) return err;
      if (nameW !== old.W) {
        this.docDirty = true;
        this.docStampFn = () => ({
          ...snap.stamp,
          sections: snap.stamp.sections.map((e) => (e.id === old.sid ? { ...e, text: nameW } : e))
        });
      }
      return undefined;
    }

    // Header + overview.
    const header = { ...snap.stamp.header };
    for (const k of HEADER_KEYS) {
      const W = snap.stamp.header[k];
      if (W === undefined) continue;
      header[k] = this.text(`header.${k}`, snap.header[k], W, ir.header[k], docOps);
      if (header[k] !== W) this.docDirty = true;
    }
    const overview = { ...snap.stamp.overview };
    for (const k of OVERVIEW_KEYS) {
      const W = snap.stamp.overview[k];
      if (W === undefined) continue;
      overview[k] = this.text(`overview.${k}`, snap.overview[k], W, ir.overview[k], docOps);
      if (overview[k] !== W) this.docDirty = true;
    }

    this.foreign('doc', snap.foreign);
    if (snap.sections.some((s) => s.orphan)) this.docDirty = true;

    // Sections.
    const deletes: PlanOp[] = [];
    const places: PlanOp[] = [];
    type Entry = { id: string | ScratchRef; text: string; oldIndex?: number };
    const entries: Entry[] = [];
    let anchor: Ref | null = null;
    const container = snap.sectionsContainer;

    seq.steps.forEach((step, n) => {
      const sec = ir.sections[n]!;
      const M = stripIndexPrefix(sec.name);
      const path = sec.index;
      if (step.kind === 'insert') {
        if (!container) return;
        this.scratch.add(n);
        const ref: ScratchRef = { s: n, part: 'section' };
        places.push({ op: 'place', node: ref, parentId: container.id, after: anchor });
        this.change({ path, action: 'insert' });
        entries.push({ id: ref, text: M });
        anchor = ref;
        this.docDirty = true;
        return;
      }
      const old = seq.old[step.o]!;
      if (!old.node) {
        if (step.kind === 'modify') this.conflict({ path, kind: 'deleted-but-changed', figma: old.W, markdown: M });
        else this.keep({ path, kind: 'designer-deleted', detail: old.W });
        entries.push({ id: old.sid, text: old.W, oldIndex: step.o });
        if (step.kind === 'move') this.docDirty = true;
        return;
      }
      if (step.kind === 'move' && container) {
        places.push({ op: 'place', node: old.node.id, parentId: container.id, after: anchor });
        this.change({ path, action: 'move' });
        this.docDirty = true;
      }
      const nameOps: PlanOp[] = [];
      this.currentBatch = `s:${old.sid}`;
      const nameW = this.text(`${path}/#name`, old.nameNode, old.W, M, nameOps);
      if (nameW !== old.W) this.docDirty = true;
      this.section(old, n, undefined, nameW, nameOps);
      this.currentBatch = 'doc';
      entries.push({ id: old.sid, text: nameW, oldIndex: step.o });
      anchor = old.node.id;
    });

    const kept: Entry[] = [];
    for (const o of seq.deleted) {
      const old = seq.old[o]!;
      const path = `-${old.W}`;
      if (!old.node) {
        this.docDirty = true;
        continue;
      }
      if (this.sectionClean(old)) {
        deletes.push({ op: 'delete', nodeId: old.node.id });
        this.change({ path, action: 'delete' });
        this.docDirty = true;
      } else {
        this.conflict({ path, kind: 'container-not-empty', figma: old.W, nodeId: old.node.id });
        kept.push({ id: old.sid, text: old.W, oldIndex: o });
      }
    }

    this.batches.push({ key: 'doc', ops: [...deletes, ...places, ...docOps] });
    const merged = mergeKept(entries, kept);
    this.docStampFn = (r) => ({
      ...snap.stamp,
      header,
      overview,
      sections: merged.map((e) => ({
        id: typeof e.id === 'string' ? e.id : String(r.stampOf(e.id)['sid']),
        text: e.text
      }))
    });
    return undefined;
  }

  // --- section -------------------------------------------------------------

  private section(
    old: SnapSection,
    n: number,
    onlyCluster: number | undefined,
    nameW: string,
    nameOps: PlanOp[]
  ): string | undefined {
    const sec = this.ir.sections[n]!;
    const key = `s:${old.sid}`;
    const ops: PlanOp[] = [...nameOps];
    let dirty = nameW !== old.W || old.clusters.some((c) => c.orphan);
    // Batches for clusters are pushed before this section's own batch.
    const prevBatch = this.currentBatch;

    const seq = this.align(
      old.clusters,
      (c) => c.W,
      sec.clusters.map((c) => stripIndexPrefix(c.title))
    );

    if (onlyCluster !== undefined) {
      const step = seq.steps[onlyCluster]!;
      const oc = step.kind === 'insert' ? undefined : seq.old[step.o];
      if (!oc?.node) {
        return `scope "${sec.index}/${onlyCluster + 1}": that cluster does not exist in the document yet`;
      }
      const titleW = this.cluster(oc, sec, n, onlyCluster);
      this.currentBatch = key;
      if (titleW !== oc.W) dirty = true;
      if (dirty && old.node && old.stamp) {
        const base = old.stamp;
        ops.push({
          op: 'stamp',
          node: old.node.id,
          stamp: () => ({
            ...base,
            name: nameW,
            clusters: base.clusters.map((e) => (e.id === oc.cid ? { ...e, text: titleW } : e))
          })
        });
      }
      this.batches.push({ key, ops });
      this.currentBatch = prevBatch;
      return undefined;
    }

    this.foreign(sec.index, old.foreign);

    type Entry = { id: string | ScratchRef; text: string; oldIndex?: number };
    const entries: Entry[] = [];
    const deletes: PlanOp[] = [];
    const places: PlanOp[] = [];
    const renumber: PlanOp[] = [];
    let anchor: Ref | null = null;
    const hasBubbles = !sec.isGlobalSpec && !!old.bubbleFrame;

    seq.steps.forEach((step, k) => {
      const cl = sec.clusters[k]!;
      const M = stripIndexPrefix(cl.title);
      const path = `${sec.index}/${k + 1}`;
      if (step.kind === 'insert') {
        if (!old.column) return;
        this.scratch.add(n);
        const ref: ScratchRef = { s: n, c: k, part: 'block' };
        this.currentBatch = key;
        places.push({ op: 'place', node: ref, parentId: old.column.id, after: anchor });
        if (hasBubbles) {
          places.push({ op: 'place', node: { s: n, c: k, part: 'bubble' }, parentId: old.bubbleFrame!.id, after: null });
        }
        this.change({ path, action: 'insert' });
        entries.push({ id: ref, text: M });
        anchor = ref;
        dirty = true;
        return;
      }
      const oc = seq.old[step.o]!;
      if (!oc.node) {
        if (step.kind === 'modify') this.conflict({ path, kind: 'deleted-but-changed', figma: oc.W, markdown: M });
        else this.keep({ path, kind: 'designer-deleted', detail: oc.W });
        entries.push({ id: oc.cid, text: oc.W, oldIndex: step.o });
        if (step.kind === 'move') dirty = true;
        return;
      }
      this.currentBatch = key;
      if (step.kind === 'move' && old.column) {
        places.push({ op: 'place', node: oc.node.id, parentId: old.column.id, after: anchor });
        this.change({ path, action: 'move' });
        dirty = true;
      }
      const titleW = this.cluster(oc, sec, n, k);
      this.currentBatch = key;
      if (titleW !== oc.W) dirty = true;
      entries.push({ id: oc.cid, text: titleW, oldIndex: step.o });
      anchor = oc.node.id;

      const num = String(k + 1);
      let renumbered = false;
      if (oc.numberNode && (oc.numberNode.characters ?? '') !== num) {
        renumber.push({ op: 'setText', nodeId: oc.numberNode.id, text: num });
        renumbered = true;
      }
      if (hasBubbles && oc.bubbleNumber && (oc.bubbleNumber.characters ?? '') !== num) {
        renumber.push({ op: 'setText', nodeId: oc.bubbleNumber.id, text: num });
        renumbered = true;
      }
      if (renumbered) this.change({ path, action: 'renumber', detail: num });
    });

    this.currentBatch = key;
    const kept: Entry[] = [];
    for (const o of seq.deleted) {
      const oc = seq.old[o]!;
      const path = `${sec.index}/-${oc.W}`;
      if (!oc.node) {
        dirty = true;
        continue;
      }
      if (this.clusterClean(oc)) {
        deletes.push({ op: 'delete', nodeId: oc.node.id });
        if (oc.bubble) deletes.push({ op: 'delete', nodeId: oc.bubble.id });
        this.change({ path, action: 'delete' });
        dirty = true;
      } else {
        this.conflict({ path, kind: 'container-not-empty', figma: oc.W, nodeId: oc.node.id });
        kept.push({ id: oc.cid, text: oc.W, oldIndex: o });
      }
    }

    // Main image.
    const asset = this.assetMap?.[sec.index];
    if (!sec.isGlobalSpec && asset && asset.type !== 'skip') {
      const path = `${sec.index}/#main`;
      if (!old.main) {
        this.conflict({ path, kind: 'figure', markdown: describeAsset(asset) });
      } else if (!sameAsset(asset, old.mainStamp?.asset)) {
        const F = this.snap.tree.subtreeHash(old.main.id);
        if (F === (old.mainStamp?.imageHash ?? null)) {
          this.fills.push({
            kind: 'main',
            path,
            nodeId: old.main.id,
            hintId: old.mainHint?.id,
            asset,
            stamp: old.mainStamp ?? { kind: 'slot', role: 'main' }
          });
          this.currentBatch = 'fills';
          this.change({ path, action: 'asset', detail: describeAsset(asset) });
          this.currentBatch = key;
        } else {
          this.conflict({ path, kind: 'figure', markdown: describeAsset(asset), nodeId: old.main.id });
        }
      }
    }

    ops.push(...deletes, ...places, ...renumber);
    if (dirty && old.node && old.stamp) {
      const base = old.stamp;
      const merged = mergeKept(entries, kept);
      ops.push({
        op: 'stamp',
        node: old.node.id,
        stamp: (r) => ({
          ...base,
          name: nameW,
          clusters: merged.map((e) => ({
            id: typeof e.id === 'string' ? e.id : String(r.stampOf(e.id)['cid']),
            text: e.text
          }))
        })
      });
    }
    this.batches.push({ key, ops });
    this.currentBatch = prevBatch;
    return undefined;
  }

  // --- cluster -------------------------------------------------------------

  /** Plans one present cluster; pushes its batch; returns the new title W. */
  private cluster(oc: SnapCluster, sec: InterfaceSection, n: number, k: number): string {
    const cl: SemanticCluster = sec.clusters[k]!;
    const key = `c:${oc.cid}`;
    this.currentBatch = key;
    const base = `${sec.index}/${k + 1}`;
    const pre: PlanOp[] = [];
    const roleOps: PlanOp[] = [];
    const seqOps: PlanOp[] = [];
    const post: PlanOp[] = [];
    let dirty = oc.items.some((it) => it.orphan);

    this.foreign(base, oc.foreign);

    const titleW = this.text(`${base}/#title`, oc.titleNode, oc.W, stripIndexPrefix(cl.title), seqOps);
    if (titleW !== oc.W) dirty = true;

    // Roles.
    const rolesW = oc.stamp?.roles ?? [];
    let roles = rolesW;
    let head: Ref | null = oc.headAnchorId ?? null;
    if (!sameRoles(rolesW, cl.roles)) {
      const path = `${base}/@roles`;
      const F = oc.roleFrame ? roleTexts(this.snap.tree, oc.roleFrame) : undefined;
      if (F && sameRoles(F, rolesW)) {
        this.scratch.add(n);
        const ref: ScratchRef = { s: n, c: k, part: 'roles' };
        roleOps.push(
          { op: 'place', node: ref, parentId: oc.node!.id, after: oc.roleFrame!.id },
          { op: 'delete', nodeId: oc.roleFrame!.id }
        );
        if (head === oc.roleFrame!.id) head = ref;
        this.change({ path, action: 'roles', detail: cl.roles.join(' ') });
        roles = [...cl.roles];
        dirty = true;
      } else if (F && sameRoles(F, cl.roles)) {
        roles = [...cl.roles];
        dirty = true;
      } else {
        this.conflict({
          path,
          kind: F ? 'text' : 'deleted-but-changed',
          figma: F?.join(' '),
          markdown: cl.roles.join(' '),
          nodeId: oc.roleFrame?.id
        });
      }
    }

    // Items.
    const want = expectedItems(cl);
    const seq = this.align(
      oc.items,
      (it) => `${it.t}:${it.W}`,
      want.map((w) => `${w.t}:${w.text}`),
      (o, ni) => {
        const old = oc.items[o]!;
        const next = want[ni]!;
        if (old.t !== next.t) return false;
        if (next.t !== 'role') return true;
        return (old.stamp?.role ?? '') === (next.role ?? '');
      }
    );

    type Entry = { id: string | ScratchRef; t: ExpectedItem['t']; text: string; oldIndex?: number };
    const entries: Entry[] = [];
    let anchor: Ref | null = head;
    let ordinal = 0;
    /** 条目落到哪一层：legacy 是簇节点，多部件是簇里的内容层。 */
    const itemsParentId = oc.itemsParent?.id ?? oc.node!.id;

    seq.steps.forEach((step, i) => {
      const w = want[i]!;
      if (w.t === 'figure') ordinal++;
      const path = `${base}/#${i + 1}`;
      if (step.kind === 'insert') {
        this.scratch.add(n);
        const ref: ScratchRef = { s: n, c: k, i, part: 'item' };
        seqOps.push({ op: 'place', node: ref, parentId: itemsParentId, after: anchor });
        this.change({ path, action: 'insert', detail: w.text });
        entries.push({ id: ref, t: w.t, text: w.text });
        anchor = ref;
        dirty = true;
        return;
      }
      const it = seq.old[step.o]!;
      if (!it.node) {
        if (step.kind === 'modify') {
          this.conflict({ path, kind: 'deleted-but-changed', figma: it.W, markdown: w.text });
        } else {
          this.keep({ path, kind: 'designer-deleted', detail: it.W });
        }
        entries.push({ id: it.iid, t: it.t, text: it.W, oldIndex: step.o });
        if (step.kind === 'move') dirty = true;
        return;
      }
      if (step.kind === 'move') {
        seqOps.push({ op: 'place', node: it.node.id, parentId: itemsParentId, after: anchor });
        this.change({ path, action: 'move' });
        dirty = true;
      }
      const textNode = it.t === 'role' ? (it.bodyNode ?? it.node) : it.node;
      const newW =
        it.t === 'figure'
          ? this.figure(path, it, w, `${sec.index}/${k + 1}/${ordinal}`, oc, seqOps)
          : this.text(path, textNode, it.W, w.text, seqOps, it.t === 'rule' ? stateBoldLength(w.text) : undefined);
      if (newW !== it.W) {
        dirty = true;
        const st = it.stamp!;
        post.push({ op: 'stamp', node: it.node.id, stamp: () => ({ ...st, text: newW }) });
      }
      entries.push({ id: it.iid, t: it.t, text: newW, oldIndex: step.o });
      anchor = it.node.id;
    });

    const kept: Entry[] = [];
    for (const o of seq.deleted) {
      const it = seq.old[o]!;
      const path = `${base}/-`;
      if (!it.node) {
        dirty = true;
        continue;
      }
      if (this.itemClean(it)) {
        pre.push({ op: 'delete', nodeId: it.node.id });
        this.change({ path, action: 'delete', detail: it.W });
        dirty = true;
      } else {
        this.conflict({
          path,
          kind: it.t === 'figure' ? 'figure' : 'text',
          figma: it.t === 'figure' ? it.W : it.node.characters ?? '',
          nodeId: it.node.id
        });
        kept.push({ id: it.iid, t: it.t, text: it.W, oldIndex: o });
      }
    }

    if (dirty && oc.node && oc.stamp) {
      const cs = oc.stamp;
      const merged = mergeKept(entries, kept);
      post.push({
        op: 'stamp',
        node: oc.node.id,
        stamp: (r): ClusterStamp => ({
          ...cs,
          title: titleW,
          roles,
          items: merged.map(
            (e): ItemManifestEntry => ({
              id: typeof e.id === 'string' ? e.id : String(r.stampOf(e.id)['iid']),
              t: e.t,
              text: e.text
            })
          )
        })
      });
    }

    this.batches.push({ key, ops: [...pre, ...roleOps, ...seqOps, ...post] });
    return titleW;
  }

  /** A present, paired figure: description hint + asset. Returns new W. */
  private figure(
    path: string,
    it: SnapItem,
    w: ExpectedItem,
    assetKey: string,
    oc: SnapCluster,
    ops: PlanOp[]
  ): string {
    const tree = this.snap.tree;
    const bareSlot = this.snap.profile.figureSlot === 'rect';
    const group = it.node!;
    const hint = bareSlot
      ? undefined
      : tree.find(
          group.id,
          (x) => x.type === 'TEXT' && x.name === SECTION_CHILD_NAMES.optionalImagePlaceholderHint
        );
    let newW = it.W;
    if (w.text !== it.W) {
      if (hint) {
        // An empty description never wrote the hint, so whatever it says is "as rendered".
        const Wh = it.W === '' ? hint.characters ?? '' : figureHintText(it.W);
        const r = this.text(path, hint, Wh, figureHintText(w.text), ops);
        newW = r === figureHintText(w.text) ? w.text : it.W;
      } else {
        newW = w.text;
      }
    } else if (hint && it.W !== '' && (hint.characters ?? '') !== figureHintText(it.W)) {
      this.keep({ path, kind: 'hand-edit', nodeId: hint.id });
    }

    const asset = this.assetMap?.[assetKey];
    const stamp = it.stamp!;
    if (asset?.type === 'figma_node' && !sameAsset(asset, stamp.asset)) {
      const F = tree.subtreeHash(group.id);
      if (F === (stamp.imageHash ?? null)) {
        // 单层矩形槽：条目节点自己就是要填图的那一层，没有内层占位矩形可找。
        const rect = bareSlot
          ? group
          : tree.find(
              group.id,
              (x) => x.type === 'RECTANGLE' && x.name === SECTION_CHILD_NAMES.optionalImageRect
            );
        this.fills.push({
          kind: 'figure',
          path,
          groupId: group.id,
          rectId: rect?.id,
          hintId: hint?.id,
          asset,
          maxWidth: oc.node?.width ?? FIGURE_MAX_WIDTH_FALLBACK,
          stamp: { ...stamp, text: newW }
        });
        const prev = this.currentBatch;
        this.currentBatch = 'fills';
        this.change({ path, action: 'asset', detail: describeAsset(asset) });
        this.currentBatch = prev;
      } else {
        this.conflict({ path, kind: 'figure', markdown: describeAsset(asset), nodeId: group.id });
      }
    } else if (stamp.imageHash !== undefined && tree.subtreeHash(group.id) !== (stamp.imageHash ?? null)) {
      this.keep({ path, kind: 'hand-edit', nodeId: group.id, detail: 'image' });
    }
    return newW;
  }

  // --- cleanliness ---------------------------------------------------------

  private itemClean(it: SnapItem): boolean {
    if (!it.node) return true;
    if (it.t === 'role') return (it.bodyNode?.characters ?? '') === it.W;
    if (it.t !== 'figure') return (it.node.characters ?? '') === it.W;
    const tree = this.snap.tree;
    if (tree.subtreeHash(it.node.id) !== (it.stamp?.imageHash ?? null)) return false;
    if (this.snap.profile.figureSlot === 'rect') return true;
    const hint = tree.find(
      it.node.id,
      (x) => x.type === 'TEXT' && x.name === SECTION_CHILD_NAMES.optionalImagePlaceholderHint
    );
    return !hint || it.W === '' || (hint.characters ?? '') === figureHintText(it.W);
  }

  private clusterClean(oc: SnapCluster): boolean {
    if (oc.foreign.length > 0) return false;
    if (oc.titleNode && (oc.titleNode.characters ?? '') !== oc.W) return false;
    if (oc.roleFrame && oc.stamp && !sameRoles(roleTexts(this.snap.tree, oc.roleFrame), oc.stamp.roles)) {
      return false;
    }
    return oc.items.every((it) => this.itemClean(it));
  }

  private sectionClean(old: SnapSection): boolean {
    if (old.foreign.length > 0) return false;
    if (old.nameNode && (old.nameNode.characters ?? '') !== old.W) return false;
    if (old.main && this.snap.tree.subtreeHash(old.main.id) !== (old.mainStamp?.imageHash ?? null)) {
      return false;
    }
    return old.clusters.every((c) => !c.node || this.clusterClean(c));
  }
}

/** New entries in order, with kept-but-deleted ones slotted after their old predecessor. */
function mergeKept<E extends { oldIndex?: number }>(entries: E[], kept: E[]): E[] {
  const out = [...entries];
  for (const k of kept) {
    let at = 0;
    let best = -1;
    out.forEach((e, idx) => {
      if (e.oldIndex !== undefined && e.oldIndex < k.oldIndex! && e.oldIndex > best) {
        best = e.oldIndex;
        at = idx + 1;
      }
    });
    out.splice(at, 0, k);
  }
  return out;
}

function describeAsset(a: AssetSpec): string {
  if (a.type === 'figma_node') return `figma_node ${a.nodeId}${a.crop ? ' (crop)' : ''}`;
  if (a.type === 'image') return 'image';
  return 'skip';
}
