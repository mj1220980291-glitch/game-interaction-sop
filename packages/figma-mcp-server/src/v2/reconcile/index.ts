/**
 * Sync mode of `render_v2_markdown_to_figma`: read → plan → (scratch) → apply.
 *
 * See openspec/changes/reconcile-render/design.md.
 */

import type { DocIR, SoftWarning } from '../ir.js';
import { SOFT_WARNING_CODES } from '../ir.js';
import type { FigmaBackend, NodeInfo, ReconcileOp } from '../figma-client.js';
import {
  applyAsset,
  boldUnavailableWarning,
  makeFigureState,
  renderInner,
  type AssetSpec,
  type RenderInput,
  type RenderResult
} from '../render.js';
import { expectedItems, stampRenderedDoc } from './layout.js';
import {
  planReconcile,
  type FillTask,
  type Plan,
  type PlanBatch,
  type Ref,
  type Resolver,
  type ScratchRef
} from './plan.js';
import { buildSnapshot } from './snapshot.js';
import { SCRATCH_ROOT_NAME, type DocStamp } from './stamp.js';
import type { TemplateRef } from '../template-config.js';
import { Tree } from './tree.js';

export type { ReconcileChange, ReconcileConflict, ReconcilePreserved } from './plan.js';

/** Another run holding the lock for less than this is considered alive. */
export const LOCK_TTL_MS = 60_000;
/** Upper bound on ops per `applyOps` call, keeping each well under the 30s cap. */
export const MAX_OPS_PER_CALL = 300;

function fail(code: string, message: string, warnings: SoftWarning[], extra: Partial<RenderResult> = {}): RenderResult {
  return { ok: false, mode: 'reconcile', errors: [{ code, message }], warnings, ...extra };
}

export async function reconcileV2(
  ir: DocIR,
  parseWarnings: SoftWarning[],
  input: RenderInput,
  backend: FigmaBackend
): Promise<RenderResult> {
  const rootId = input.target!.rootId!;
  if (!backend.readStampedTree || !backend.stampNodes || !backend.applyOps) {
    return fail('V2_RECONCILE_UNSUPPORTED', 'this backend cannot read or write stamps, so it cannot sync', parseWarnings);
  }

  let tree: Tree;
  try {
    tree = new Tree(await backend.readStampedTree(rootId), rootId);
  } catch (e) {
    return fail('V2_ROOT_NOT_FOUND', (e as Error).message, parseWarnings);
  }
  if (tree.root.parsed?.kind !== 'doc') {
    return fail(
      'V2_NOT_STAMPED',
      `node ${rootId} carries no document stamp: it was rendered before sync support existed, ` +
        `or is not an engine-rendered document. It has to be adopted first.`,
      parseWarnings
    );
  }

  const snap = buildSnapshot(tree);
  const planned = planReconcile(snap, ir, { scope: input.scope, assetMap: input.assetMap });
  if (!planned.ok) return fail(planned.code, planned.message, parseWarnings);
  const plan = planned.plan;
  const warnings = [...parseWarnings, ...snap.warnings];
  const report = { changes: plan.changes, conflicts: plan.conflicts, preserved: plan.preserved };
  const ok = (): RenderResult => ({
    ok: true,
    mode: 'reconcile',
    rootInstanceId: rootId,
    errors: [],
    warnings,
    ...report
  });

  if (input.dryRun || !plan.hasWrites) return ok();

  const lock = snap.stamp.lock;
  if (lock && Date.now() - lock.at < LOCK_TTL_MS) {
    return fail(
      'V2_RECONCILE_BUSY',
      `another sync (run ${lock.runId}) started ${Math.round((Date.now() - lock.at) / 1000)}s ago and has not finished`,
      warnings
    );
  }

  const { lock: _stale, ...unlocked } = snap.stamp;
  const runId = Math.random().toString(36).slice(2, 10);
  await backend.commitUndoCheckpoint('v2-reconcile-start');
  if (tree.strayScratchIds.length > 0) await backend.deleteNodes(tree.strayScratchIds);
  await backend.applyOps([
    { op: 'stamp', nodeId: rootId, stamp: { ...unlocked, lock: { runId, at: Date.now() } } }
  ]);

  const done = new Set<string>();
  let scratchRootId: string | undefined;
  let docStamped = false;
  try {
    let resolver: Resolver = directResolver;
    if (plan.scratchSections.length > 0) {
      const scratch = await renderScratch(backend, ir, plan, input.assetMap, tree.pageId, (id) => {
        scratchRootId = id;
      }, input.template);
      scratchRootId = scratch.rootId;
      resolver = scratch.resolver;
      warnings.push(...scratch.warnings);
    }

    const chunks = chunkBatches(plan.batches, resolver);
    for (const chunk of chunks) {
      const r = await backend.applyOps(chunk.ops);
      for (const family of r.boldUnavailable ?? []) {
        const seen = warnings.some(
          (w) => w.code === SOFT_WARNING_CODES.W_STATE_BOLD_UNAVAILABLE && w.context === family
        );
        if (!seen) warnings.push(boldUnavailableWarning(family));
      }
      if (r.failedAt !== undefined) {
        throw Object.assign(new Error(`applyOps stopped at op ${r.failedAt}: ${r.reason ?? 'unknown'}`), {
          code: 'V2_RECONCILE_APPLY_FAILED'
        });
      }
      for (const k of chunk.keys) done.add(k);
    }

    const failedFills = await runFills(backend, plan.fills, warnings);
    done.add('fills');

    const docStamp: DocStamp = { ...plan.docStamp(resolver) };
    delete docStamp.lock;
    const r = await backend.applyOps([{ op: 'stamp', nodeId: rootId, stamp: docStamp as unknown as Record<string, unknown> }]);
    if (r.failedAt !== undefined) {
      throw Object.assign(new Error(`could not write the document stamp: ${r.reason ?? 'unknown'}`), {
        code: 'V2_RECONCILE_APPLY_FAILED'
      });
    }
    docStamped = true;
    done.add('doc');

    report.changes = plan.changes.filter((c) => !(plan.changeBatch.get(c) === 'fills' && failedFills.has(c.path)));
    return ok();
  } catch (e) {
    const err = e as Error & { code?: string };
    return fail(err.code ?? 'V2_RECONCILE_RUNTIME_ERROR', err.message, warnings, {
      rootInstanceId: rootId,
      changes: plan.changes.filter((c) => done.has(plan.changeBatch.get(c) ?? '')),
      conflicts: plan.conflicts,
      preserved: plan.preserved
    });
  } finally {
    if (scratchRootId) {
      try {
        await backend.deleteNodes([scratchRootId]);
      } catch {
        /* swept up as a stray by the next sync */
      }
    }
    if (!docStamped) {
      try {
        await backend.applyOps([{ op: 'stamp', nodeId: rootId, stamp: unlocked as unknown as Record<string, unknown> }]);
      } catch {
        /* lock expires on its own after LOCK_TTL_MS */
      }
    }
  }
}

// --- Resolution -------------------------------------------------------------

const directResolver: Resolver = {
  id(ref) {
    if (typeof ref === 'string') return ref;
    throw new Error(`internal: scratch node ${JSON.stringify(ref)} requested without a scratch render`);
  },
  stampOf(ref) {
    throw new Error(`internal: stamp of ${JSON.stringify(ref)} requested without a scratch render`);
  }
};

interface Chunk {
  ops: ReconcileOp[];
  keys: string[];
}

function chunkBatches(batches: PlanBatch[], r: Resolver): Chunk[] {
  const out: Chunk[] = [];
  let cur: Chunk = { ops: [], keys: [] };
  for (const b of batches) {
    const ops = b.ops.map((op): ReconcileOp => {
      switch (op.op) {
        case 'setText':
        case 'delete':
          return op;
        case 'place':
          return {
            op: 'place',
            nodeId: r.id(op.node),
            parentId: op.parentId,
            afterId: op.after === null ? null : r.id(op.after)
          };
        case 'stamp':
          return { op: 'stamp', nodeId: r.id(op.node), stamp: op.stamp(r) as Record<string, unknown> };
      }
    });
    if (cur.ops.length > 0 && cur.ops.length + ops.length > MAX_OPS_PER_CALL) {
      out.push(cur);
      cur = { ops: [], keys: [] };
    }
    cur.ops.push(...ops);
    cur.keys.push(b.key);
  }
  if (cur.ops.length > 0) out.push(cur);
  return out;
}

// --- Scratch ----------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Render just the sections that new nodes have to come from into a
 * throwaway doc, stamp it, and hand back a resolver for `ScratchRef`s.
 */
async function renderScratch(
  backend: FigmaBackend,
  ir: DocIR,
  plan: Plan,
  assetMap: Record<string, AssetSpec> | undefined,
  pageId: string | undefined,
  onRoot: (id: string) => void,
  template?: Partial<TemplateRef>
): Promise<{ rootId: string; resolver: Resolver; warnings: SoftWarning[] }> {
  const pos = new Map<number, number>();
  plan.scratchSections.forEach((s, p) => pos.set(s, p));
  const scratchIr: DocIR = {
    header: { ...ir.header, title: SCRATCH_ROOT_NAME },
    overview: ir.overview,
    sections: plan.scratchSections.map((s, p) => ({
      ...ir.sections[s]!,
      index: pad2(p + 1),
      indexNum: p + 1
    }))
  };

  // Only the assets of nodes that will actually be moved out: every export
  // costs real time, and the rest of the scratch doc is thrown away.
  const used = usedAssetKeys(ir, plan);
  const remapped: Record<string, AssetSpec> = {};
  for (const [key, value] of Object.entries(assetMap ?? {})) {
    if (!used.has(key)) continue;
    const m = /^(\d{2})(\/.*)?$/.exec(key);
    if (!m) continue;
    const s = ir.sections.findIndex((x) => x.index === m[1]);
    const p = pos.get(s);
    if (p !== undefined) remapped[pad2(p + 1) + (m[2] ?? '')] = value;
  }

  const figures = makeFigureState(remapped);
  let rootId: string | undefined;
  rootId = await renderInner(
    scratchIr,
    { markdown: '', assetMap: remapped, target: { pageId }, template },
    backend,
    figures,
    (id) => {
      rootId = id;
      onRoot(id);
    }
  );
  const stamped = await stampRenderedDoc(backend, rootId, scratchIr, remapped);
  if (stamped.problems.length > 0) {
    throw Object.assign(new Error(`scratch render did not line up: ${stamped.problems.join('; ')}`), {
      code: 'V2_RECONCILE_SCRATCH_MISMATCH'
    });
  }

  const resolver: Resolver = {
    id(ref: Ref): string {
      if (typeof ref === 'string') return ref;
      const id = scratchId(stamped.layout, pos, ref);
      if (!id) throw new Error(`scratch node not found for ${JSON.stringify(ref)}`);
      return id;
    },
    stampOf(ref: Ref) {
      const s = stamped.stamps.get(resolver.id(ref));
      if (!s) throw new Error(`scratch node for ${JSON.stringify(ref)} carries no stamp`);
      return s;
    }
  };
  return { rootId, resolver, warnings: figures.warnings };
}

function scratchId(
  layout: Awaited<ReturnType<typeof stampRenderedDoc>>['layout'],
  pos: Map<number, number>,
  ref: ScratchRef
): string | undefined {
  const p = pos.get(ref.s);
  const sec = p === undefined ? undefined : layout.sections[p];
  if (!sec) return undefined;
  if (ref.part === 'section') return sec.nodeId;
  const cl = ref.c === undefined ? undefined : sec.clusters[ref.c];
  if (!cl) return undefined;
  switch (ref.part) {
    case 'block':
      return cl.blockId;
    case 'bubble':
      return cl.bubbleId;
    case 'roles':
      return cl.roleFrameId;
    case 'item':
      return ref.i === undefined ? undefined : cl.items[ref.i]?.nodeId;
  }
}

/** Asset keys (in markdown numbering) whose nodes the plan moves out of the scratch doc. */
function usedAssetKeys(ir: DocIR, plan: Plan): Set<string> {
  const keys = new Set<string>();
  for (const b of plan.batches) {
    for (const op of b.ops) {
      if (op.op !== 'place' || typeof op.node === 'string') continue;
      const ref = op.node;
      const sec = ir.sections[ref.s]!;
      if (ref.part === 'section') {
        keys.add(sec.index);
        sec.clusters.forEach((c, ci) => figureKeys(sec.index, ci, c).forEach((k) => keys.add(k)));
      } else if (ref.part === 'block' && ref.c !== undefined) {
        figureKeys(sec.index, ref.c, sec.clusters[ref.c]!).forEach((k) => keys.add(k));
      } else if (ref.part === 'item' && ref.c !== undefined && ref.i !== undefined) {
        const items = expectedItems(sec.clusters[ref.c]!);
        const it = items[ref.i];
        if (it?.ordinal !== undefined) keys.add(`${sec.index}/${ref.c + 1}/${it.ordinal}`);
      }
    }
  }
  return keys;
}

function figureKeys(index: string, ci: number, cluster: DocIR['sections'][number]['clusters'][number]): string[] {
  return expectedItems(cluster)
    .filter((i) => i.ordinal !== undefined)
    .map((i) => `${index}/${ci + 1}/${i.ordinal}`);
}

// --- Asset fills ------------------------------------------------------------

/** Returns the paths whose fill failed. */
async function runFills(backend: FigmaBackend, fills: FillTask[], warnings: SoftWarning[]): Promise<Set<string>> {
  const failed = new Set<string>();
  for (const f of fills) {
    try {
      if (f.kind === 'main') {
        await applyAsset(backend, { id: f.nodeId, name: '', type: 'RECTANGLE' } as NodeInfo, f.asset);
        if (f.hintId) await backend.deleteNodes([f.hintId]);
        await backend.stampNodes!([
          { nodeId: f.nodeId, stamp: { ...f.stamp, asset: f.asset } as unknown as Record<string, unknown>, captureHash: true }
        ]);
      } else {
        if (!backend.fillFigurePlaceholder) throw new Error('backend lacks fillFigurePlaceholder');
        if (!f.rectId) throw new Error(`配图 GROUP ${f.groupId} has no 配图占位 RECTANGLE`);
        await backend.fillFigurePlaceholder({
          sourceNodeId: f.asset.nodeId,
          groupId: f.groupId,
          rectId: f.rectId,
          hintId: f.hintId,
          crop: f.asset.crop,
          scale: f.asset.scale,
          maxWidth: f.maxWidth
        });
        await backend.stampNodes!([
          { nodeId: f.groupId, stamp: { ...f.stamp, asset: f.asset } as unknown as Record<string, unknown>, captureHash: true }
        ]);
      }
    } catch (e) {
      failed.add(f.path);
      warnings.push({
        code: SOFT_WARNING_CODES.W_FIGURE_FILL_FAILED,
        message: `${f.path}: ${(e as Error).message}`,
        context: f.path
      });
    }
  }
  return failed;
}
