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
  figureSlotsFromIr,
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
import { LEGACY_PROFILE, profileFor, type StructureProfile } from './structure.js';
import { packHash, packComponents } from '../template/pack-hash.js';
import { loadPartsPack } from '../template-config.js';
import { isTransientBridgeError } from '../../server/retry.js';
import { stampPartsDoc, type PartsDocLayout } from '../render/parts/stamp-parts.js';
import { refreshChapterGeometry, relayoutBadges, readBadges } from '../render/parts/geometry.js';
import { pickAnchors } from '../badge-anchor.js';
import { SCRATCH_ROOT_NAME, type DocStamp } from './stamp.js';
import type { TemplateRef } from '../template-config.js';
import type { TemplatePack } from '../template/schema.js';
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
  const runId = Math.random().toString(36).slice(2, 10);
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

  const docStamp = tree.root.parsed as DocStamp;
  const profile = profileFor(docStamp);
  const adoptWarnings: SoftWarning[] = [];
  let partsPack: TemplatePack | undefined;
  /** `refingerprint`：按当前包同步成功后，把文档上的 pack 指纹重打一遍。 */
  let adopt: 'missing-pack' | 'refingerprint' | undefined;
  if (profile.id === 'parts') {
    // 部件重编会改槽位名与能力；在旧结构上按新能力同步会删错节点。
    const current = loadPartsPack()?.pack;
    // 早期 pack 文档、现在机器上没有 pack：componentKey 在 = 隐式 adopt
    // （这是 M1 现场唯一走得通的路），否则要显式 forceReconcile。
    const adoptMissing = input.forceReconcile === true || Boolean(input.template?.componentKey);
    if (!current) {
      if (!adoptMissing) {
        return fail(
          'V2_PACK_MISMATCH',
          'this document was rendered from a template pack, but no pack is configured now. ' +
            'Pass template.componentKey（团队库已发布组件）或 forceReconcile:true 继续在旧文档上增量同步（adopt），' +
            '否则只能整篇重渲；重渲会丢掉设计师的手改与手贴内容。',
          parseWarnings
        );
      }
      adopt = 'missing-pack';
      adoptWarnings.push({
        code: SOFT_WARNING_CODES.W_PACK_ADOPTED,
        message:
          '模板包当前不可用，已按 adopt 模式继续同步：只改文字 / 配图，跳过标号重排与部件能力校验。' +
          '同步成功后文档指纹保持原样；重新配好模板包后可再跑一次对齐。'
      });
    } else {
      const expected = docStamp.parts?.packHash;
      if (expected && expected !== packHash(current)) {
        if (!(input.forceReconcile === true)) {
          return fail(
            'V2_PACK_MISMATCH',
            `the template pack changed since this document was rendered (${expected} → ${packHash(current)}). ` +
              '按新能力改旧结构可能删错节点，所以默认拒绝。确认结构没变的话传 forceReconcile:true：' +
              '引擎会按当前包同步，并在成功后重打指纹（adopt）。',
            parseWarnings
          );
        }
        adopt = 'refingerprint';
        adoptWarnings.push({
          code: SOFT_WARNING_CODES.W_PACK_ADOPTED,
          message:
            `模板包指纹已变（${expected} → ${packHash(current)}），已按 adopt 模式继续同步，` +
            '成功后文档指纹会重打成当前包——之后不再报 V2_PACK_MISMATCH。'
        });
      }
      partsPack = current;
    }
  }
  if (
    !input.badgeAnchors &&
    !parseWarnings.some((w) => w.code === SOFT_WARNING_CODES.W_BADGE_ANCHOR_DEFAULTED)
  ) {
    // 同步不按网格重摆标号：只重排变更章节。所以文案不能说「按网格摆放」——
    // adopt 模式连重排都跳过，说成"摆放"会让人以为标号被移动过。
    const clusterCount = ir.sections.reduce((n, s) => n + s.clusters.length, 0);
    if (clusterCount > 0) {
      parseWarnings.push({
        code: SOFT_WARNING_CODES.W_BADGE_ANCHOR_DEFAULTED,
        message:
          adopt === 'missing-pack'
            ? `本次未传 badgeAnchors，adopt 模式跳过标号重排：${clusterCount} 个标号保持画布现状（未移动）`
            : `本次未传 badgeAnchors：同步只重排变更章节的标号（共 ${clusterCount} 簇），其余标号保持画布现状`
      });
    }
  }

  // adopt 且没有模板包：本轮建不了新节点（parts scratch 需要包）。计划侧把这批
  // 改动记成 needs-new-node，这里再聚合一条可读告警。
  const canCreate = profile.id === 'parts' ? Boolean(partsPack) : true;

  const snap = buildSnapshot(tree, profile);
  const planned = planReconcile(snap, ir, {
    scope: input.scope,
    assetMap: input.assetMap,
    // `inline-suffix` 模板把职能拼在正文句尾：计划侧必须按同一份文本比对，
    // 否则每次同步都以为条目被改过，来回重写。
    inlineRoles: partsPack?.capabilities.roleAnnotation === 'inline-suffix',
    canCreate
  });
  if (!planned.ok) return fail(planned.code, planned.message, parseWarnings);
  const plan = planned.plan;
  const cannotCreate = plan.conflicts.filter((c) => c.kind === 'needs-new-node');
  if (cannotCreate.length > 0) {
    adoptWarnings.push({
      code: SOFT_WARNING_CODES.W_RECONCILE_NO_CREATE,
      message:
        `adopt 模式下模板包不可用，本轮只改既有节点：${cannotCreate.length} 处需要新建节点，` +
        `已列入 conflicts（kind: needs-new-node，路径 ${cannotCreate
          .slice(0, 5)
          .map((c) => c.path)
          .join(' / ')}）。配回模板包后重跑可补齐。`
    });
  }
  const warnings = [...parseWarnings, ...snap.warnings, ...plan.warnings, ...adoptWarnings];
  const report = { changes: plan.changes, conflicts: plan.conflicts, preserved: plan.preserved };
  /** 本次同步后画布上的标号：章节 → 簇序号 + 节点 id（对账用，E5）。 */
  const bubbles: Array<{ section: string; cluster: number; nodeId: string }> = [];
  const chapterFor = (i: number, section: DocIR['sections'][number]) => {
    const M = section.name.replace(/^\s*\d+\s*[.、．]\s*/, '').trim();
    return snap.sections.find((s) => s.node && s.W === M) ?? (snap.sections[i]?.node ? snap.sections[i] : undefined);
  };
  /**
   * 同步不重渲文档，标号清单只能从画布读。写完之后读才是权威结果（同步可能
   * 重排了新增标号）；dryRun 不写，读到的仍是现状，同样有意义。
   */
  const readAllBadges = async (): Promise<void> => {
    for (let i = 0; i < ir.sections.length; i += 1) {
      const section = ir.sections[i]!;
      const hit = chapterFor(i, section);
      if (!hit?.node) continue;
      const frames = await readBadges(
        backend,
        hit.node.id,
        section.index,
        section.clusters.length,
        warnings,
        partsPack?.capabilities.badgeSlot
      );
      frames.forEach((n, k) => bubbles.push({ section: section.index, cluster: k + 1, nodeId: n.id }));
    }
  };
  const ok = async (): Promise<RenderResult> => {
    await readAllBadges();
    const figureSlots = figureSlotsFromIr(ir);
    return {
      ok: true,
      mode: 'reconcile',
      rootInstanceId: rootId,
      runId,
      ...(bubbles.length > 0 ? { bubbles } : {}),
      ...(figureSlots.length > 0 ? { figureSlots } : {}),
      errors: [],
      warnings,
      ...report
    };
  };

  // 只改标号锚点（md 没动）也要写画布：否则「只改标号位置」这条路径永远不生效。
  const anchorsOnly =
    !!input.badgeAnchors && Object.keys(input.badgeAnchors).length > 0 && !plan.hasWrites;
  if (input.dryRun || (!plan.hasWrites && !anchorsOnly)) return ok();

  const lock = snap.stamp.lock;
  if (lock && Date.now() - lock.at < LOCK_TTL_MS) {
    return fail(
      'V2_RECONCILE_BUSY',
      `another sync (run ${lock.runId}) started ${Math.round((Date.now() - lock.at) / 1000)}s ago and has not finished`,
      warnings
    );
  }

  const { lock: _stale, ...unlocked } = snap.stamp;
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
      }, input.template, profile);
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

    // 多部件文档：簇集合一变，章节高度、左列贴合、标号数量与位置都得重算。
    if (partsPack) {
      const changed = await changedSections(plan.changes, ir, snap);
      for (const hit of changed) {
        await refreshChapterGeometry(backend, hit.nodeId);
        if (hit.clusterChanged) {
          await relayoutBadges(
            backend,
            hit.nodeId,
            hit.index,
            hit.clusterCount,
            hit.previousClusterCount,
            partsPack.capabilities.badgeSlot,
            warnings,
            partsPack.geometry,
            input.badgeAnchors
              ? pickAnchors(input.badgeAnchors, hit.index, hit.clusterCount)
              : undefined
          );
        }
      }
      // 只给了新锚点、md 没改的章节：也要按锚点重摆（上一次循环覆盖不到）。
      if (input.badgeAnchors) {
        const touched = new Set(changed.map((h) => h.index));
        for (const section of ir.sections) {
          if (touched.has(section.index)) continue;
          const anchors = pickAnchors(input.badgeAnchors, section.index, section.clusters.length);
          if (!anchors.some((a) => a !== undefined)) continue;
          const hit = snap.sections.find((s) => s.W === section.name && s.node);
          if (!hit?.node) continue;
          await relayoutBadges(
            backend,
            hit.node.id,
            section.index,
            section.clusters.length,
            section.clusters.length,
            partsPack.capabilities.badgeSlot,
            warnings,
            partsPack.geometry,
            anchors,
            false
          );
        }
      }

      // 收尾复位：每章都要，不只是改动过的那些。
      // 同步期间的填充、标号重摆都会把栏目的 HUG 重新压成固定高（真机 0.3.5：
      // create 后 1200 HUG，4 次 reconcile 后 6716 / 10917 FIXED），所以这段必须
      // 排在所有写入之后、打文档标记之前。
      if (backend.normalizeChapterLayout) {
        for (const section of snap.sections) {
          if (!section.node) continue;
          try {
            await backend.normalizeChapterLayout({ chapterId: section.node.id });
          } catch {
            /* 高度复位失败不该让整轮同步失败 */
          }
        }
      }
    }

    const docStamp: DocStamp = { ...plan.docStamp(resolver) };
    delete docStamp.lock;
    // adopt：按当前包同步成功 → 重打指纹，下次不再报 V2_PACK_MISMATCH。
    if (adopt === 'refingerprint' && partsPack) {
      docStamp.structure = 'parts';
      docStamp.parts = {
        structure: 'parts',
        packHash: packHash(partsPack),
        components: packComponents(partsPack)
      };
    }
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
    const appliedPaths = plan.changes
      .filter((c) => done.has(plan.changeBatch.get(c) ?? ''))
      .map((c) => c.path);
    // E6：写操作超时 / 断连无法排除「执行成功但响应丢失」。同步是收敛的——
    // 已落地的批次在这里按 changes 交账，重跑同参数不会重复插入。
    const transient = isTransientBridgeError(err.message);
    if (transient) {
      warnings.push({
        code: SOFT_WARNING_CODES.W_WRITE_TIMEOUT_RECONCILED,
        message:
          `写操作遇到 Bridge 超时 / 断连（runId ${runId}）。已按批次对账：` +
          `${appliedPaths.length} 处改动确认落地（见 changes）。` +
          '用相同参数重跑是幂等的，不要改用新建模式。'
      });
    }
    return fail(err.code ?? 'V2_RECONCILE_RUNTIME_ERROR', err.message, warnings, {
      rootInstanceId: rootId,
      runId,
      ...(transient ? { sideEffects: { appliedPaths } } : {}),
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

/**
 * 改动过的章节：`changes` 的路径是 `NN/...`，按界面序号找回画布上的章节。
 * 用 markdown 里的界面名对位，不假定序号顺序没变（重排会打乱）。
 *
 * `clusterChanged` 表示这一章的簇集合动了（路径正好是 `NN/C`，没有更深的 `/#N`），
 * 那种情况标号数量与位置都要重排。
 */
async function changedSections(
  changes: Array<{ path: string }>,
  ir: DocIR,
  snap: { sections: Array<{ W: string; node?: { id: string }; stamp?: { clusters?: unknown[] } }> }
): Promise<
  Array<{
    nodeId: string;
    index: string;
    clusterChanged: boolean;
    clusterCount: number;
    previousClusterCount: number;
  }>
> {
  const touched = new Map<number, boolean>();
  for (const c of changes) {
    const m = /^(\d{2})/.exec(c.path);
    if (!m) continue;
    const n = Number(m[1]);
    // 簇级改动的路径只有一段（`01/3` 插入、`01/-簇四` 删除）；条目级会更深。
    const clusterLevel = /^\d{2}\/[^/]+$/.test(c.path);
    touched.set(n, (touched.get(n) ?? false) || clusterLevel);
  }
  const out: Array<{
    nodeId: string;
    index: string;
    clusterChanged: boolean;
    clusterCount: number;
    previousClusterCount: number;
  }> = [];
  for (const [n, clusterChanged] of touched) {
    const section = ir.sections[n - 1];
    if (!section) continue;
    const hit = snap.sections.find((s) => s.W === section.name && s.node);
    if (!hit?.node) continue;
    out.push({
      nodeId: hit.node.id,
      index: section.index,
      clusterChanged,
      clusterCount: section.clusters.length,
      previousClusterCount: hit.stamp?.clusters?.length ?? 0
    });
  }
  return out;
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
  template?: Partial<TemplateRef>,
  profile: StructureProfile = LEGACY_PROFILE
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
  const used = usedAssetKeys(ir, plan, profile.id !== 'parts');
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
  let partsLayout: PartsDocLayout | undefined;
  rootId = await renderInner(
    scratchIr,
    { markdown: '', assetMap: remapped, target: { pageId }, template },
    backend,
    figures,
    (id) => {
      rootId = id;
      onRoot(id);
    },
    undefined,
    (layout) => {
      partsLayout = layout;
    }
  );

  if (profile.scratch === 'parts') {
    const pack = loadPartsPack()?.pack;
    if (!partsLayout || !pack) {
      const where = plan.scratchSections
        .map((s) => {
          const sec = ir.sections[s];
          return sec ? `${sec.index}「${sec.name}」` : `#${s}`;
        })
        .join(' / ');
      const why = !pack
        ? '当前没有可用的模板包，parts scratch 渲染不了——adopt 模式本来就不该走到这里（需要新节点的改动应记成 needs-new-node）'
        : '部件布局回调没有触发（临时文档没走 parts 渲染路径）';
      throw Object.assign(
        new Error(
          `scratch 渲染没有产出 parts 布局：需要新建节点的章节有 ${plan.scratchSections.length} 个（${where}）。` +
            `原因：${why}。这些路径是新插入的界面/簇/条目，不是文字改动；先确认 md 是否真的新增了内容，或配置回模板包后重跑。`
        ),
        {
          code: 'V2_RECONCILE_SCRATCH_MISMATCH',
          details: {
            sections: plan.scratchSections,
            sectionLabels: where,
            packAvailable: Boolean(pack),
            profile: profile.id
          }
        }
      );
    }
    const { missing, written } = await stampPartsDoc(backend, partsLayout, scratchIr, pack);
    if (missing.length > 0) {
      const where = plan.scratchSections
        .map((s) => {
          const sec = ir.sections[s];
          return sec ? `${sec.index}「${sec.name}」` : `#${s}`;
        })
        .join(' / ');
      throw Object.assign(
        new Error(
          `scratch 渲染与计划对不上：${missing.join('; ')}` +
            `（临时文档章节：${where}；pack=${pack.project ?? '未命名'}）。` +
            '通常是模板部件的槽位名与计划侧的序号不同源（`####` 标题 / 职能条目 / 隐藏槽）。'
        ),
        {
          code: 'V2_RECONCILE_SCRATCH_MISMATCH',
          details: { missing, sections: plan.scratchSections, sectionLabels: where }
        }
      );
    }
    const layoutRef = partsLayout;
    const resolver: Resolver = {
      id(ref: Ref): string {
        if (typeof ref === 'string') return ref;
        const id = scratchPartsId(layoutRef, pos, ref);
        if (id) return id;
        // 越界 = 计划侧的条目序号与临时文档的条目清单不同源（`####` 标题、职能
        // 条目、被隐藏的槽都会让两边错位）。以前这里抛裸 Error，最后被包成
        // `V2_RECONCILE_RUNTIME_ERROR`，只剩下 "scratch node not found"，看不出
        // 到底差在哪一条。
        const p = pos.get(ref.s);
        const sec = p === undefined ? undefined : layoutRef.sections[p];
        const cl = ref.c === undefined ? undefined : sec?.clusters[ref.c];
        throw Object.assign(
          new Error(
            `scratch 条目 ${JSON.stringify(ref)} 在临时文档里找不到` +
              `（该簇实测 ${cl ? cl.items.length : 0} 条，ref 指向第 ${(ref.i ?? 0) + 1} 条）`
          ),
          {
            code: 'V2_RECONCILE_ITEM_OUT_OF_RANGE',
            details: {
              ref,
              layoutItems: cl ? cl.items.length : 0,
              clusterTitle: cl?.title
            }
          }
        );
      },
      stampOf(ref: Ref) {
        const id = resolver.id(ref);
        const hit = written.get(id);
        if (!hit) throw new Error(`scratch node ${id} carries no stamp`);
        return hit as { [k: string]: unknown };
      }
    };
    return { rootId, resolver, warnings: figures.warnings };
  }

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

function scratchPartsId(
  layout: PartsDocLayout,
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
      return cl.nodeId;
    case 'bubble':
      return cl.bubbleId;
    case 'item':
      return ref.i === undefined ? undefined : cl.items[ref.i]?.nodeId;
    default:
      // parts 的职能写在条目句尾（inline-suffix），没有职能标记框可搬。
      return undefined;
  }
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
function usedAssetKeys(ir: DocIR, plan: Plan, includeRoles: boolean): Set<string> {
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
        const items = expectedItems(sec.clusters[ref.c]!, { includeRoles });
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
        if (f.asset.type === 'figma_instance' && backend.placeInstance) {
          // 实例替换会换节点 id：stamp 必须写到新节点上，否则下一轮同步会把
          // 主图当成设计师手贴的 foreign，并认为 main 槽缺失。
          const placed = await backend.placeInstance({
            sourceId: f.asset.nodeId,
            placeholderId: f.nodeId
          });
          if (f.hintId) await backend.deleteNodes([f.hintId]);
          await backend.stampNodes!([
            {
              nodeId: placed.id,
              stamp: { ...f.stamp, asset: f.asset } as unknown as Record<string, unknown>,
              captureHash: true
            }
          ]);
        } else {
          await applyAsset(backend, { id: f.nodeId, name: '', type: 'RECTANGLE' } as NodeInfo, f.asset);
          if (f.hintId) await backend.deleteNodes([f.hintId]);
          await backend.stampNodes!([
            { nodeId: f.nodeId, stamp: { ...f.stamp, asset: f.asset } as unknown as Record<string, unknown>, captureHash: true }
          ]);
        }
      } else {
        if (!backend.fillFigurePlaceholder) throw new Error('backend lacks fillFigurePlaceholder');
        if (!f.rectId) throw new Error(`配图 GROUP ${f.groupId} has no 配图占位 RECTANGLE`);
        try {
          const filled = await backend.fillFigurePlaceholder({
            sourceNodeId: f.asset.nodeId,
            groupId: f.groupId,
            rectId: f.rectId,
            hintId: f.hintId,
            crop: f.asset.crop,
            scale: f.asset.scale,
            maxWidth: f.maxWidth
          });
          if (filled.softFails && filled.softFails.length > 0) {
            warnings.push({
              code: SOFT_WARNING_CODES.W_FIGURE_FILL_FALLBACK,
              message: `${f.path}: 图已落上，但这些收尾步骤失败——${filled.softFails.join('；')}`,
              context: f.path
            });
          }
        } catch (fillError) {
          // 槽级填图会顺带 resize 组、删文案，其中任何一步在目标文档里都可能被
          // Figma 拒绝（真机：`object is not extensible`，create 能填、reconcile 不行）。
          // 这时退化成「只把图刷进矩形」：图还在，尺寸不再按比例调。
          if (!backend.rasterizeNodeToImageFill) throw fillError;
          try {
            await backend.rasterizeNodeToImageFill({
              sourceNodeId: f.asset.nodeId,
              targetNodeId: f.rectId,
              ...(f.asset.crop ? { crop: f.asset.crop } : {}),
              ...(f.asset.scale !== undefined ? { scale: f.asset.scale } : {})
            });
          } catch (fallbackError) {
            // 两条路都不通才真正失败；message 要带全，别只留第一层。
            throw Object.assign(
              new Error(
                `槽级填图失败（${(fillError as Error).message}）；` +
                  `退化刷图也失败（${(fallbackError as Error).message}）`
              ),
              { code: 'V2_FIGURE_FILL_FAILED' }
            );
          }
          warnings.push({
            code: SOFT_WARNING_CODES.W_FIGURE_FILL_FALLBACK,
            message:
              `${f.path}: 槽级填图失败（${(fillError as Error).message}），已退化为直接刷图，` +
              '尺寸未按源图比例调整',
            context: f.path
          });
        }
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
