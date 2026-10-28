/**
 * 编译编排 — 把各步骤串成一次可调用的事务。
 *
 * 两段式（Figma 没有发布 API，中间那一下必须由人在 Assets 面板按）：
 *
 *   phase=compile → 前置校验 → 撤销点 → 建 4 部件 → 字体归一化 → 补标号容器
 *                 → 收编嵌套零件 → 产物能力重算 → 报告（components 全 null）
 *   （人工）发布库
 *   phase=verify  → 真 import 冒烟 → 写 template.json（components 回填真实 key）
 *
 * Spec: openspec/changes/template-compile-to-library (D6 / D10 / 11.x)
 */

import type { AdoptResult, FigmaBackend } from '../figma-client.js';
import { buildProbeTree, type ProbeTree } from '../probe/tree.js';
import { DEFAULT_CAPABILITIES, type Capabilities, type TemplatePack } from '../template/schema.js';
import { adoptNestedParts, type AdoptOutcome } from './adopt.js';
import { normalizeSlotNames, type SlotRename } from './normalize-slots.js';
import { slimParts } from './slim-parts.js';
import { applyAdaptiveLayout, type AdaptiveApplied } from './adaptive-layout.js';
import { buildMdContract, MD_CONTRACT_RELATIVE_PATH, type MdContract } from './md-contract.js';
import { loadTemplatePack } from '../template-config.js';
import { intake, type IntakeCheck } from './intake.js';
import { ensureBadgeContainer, ensureBadgeMaster } from './badge-container.js';
import { buildTemplatePack, verifyPublished, type ComponentKeys } from './backfill.js';
import type { CompileGap } from './errors.js';
import { buildWeightMap, COMPILE_FONT_FAMILY } from './font-normalize.js';
import { buildParts, PART_LABELS, planParts, type PartName } from './parts.js';
import { preflight } from './preflight.js';
import { deriveCapabilities, type CapabilityDiff } from './verify-capabilities.js';
import { COMPILE_CODES, compileError } from './errors.js';

export interface CompileInput {
  phase: 'compile' | 'verify' | 'contract';
  source: { fileKey?: string; nodeId: string };
  library: { fileKey: string; pageId: string };
  project: string;
  /** `_staging` 页上人工粘好的部件节点 id。 */
  staged?: Partial<Record<PartName, string>> & { chapterTitle?: string };
  /** 收编出来的零件落到哪一页（库文件内）。 */
  partsPageId?: string;
  /** 散落标号模板用来补容器的 `1:14` `气泡` 节点 id。 */
  badgeContainerSourceId?: string;
  /** 源模板的能力判定（来自探针）。 */
  capabilities?: Capabilities;
  /** 探针给出的母版信息，用于进门检查（名字 / 尺寸）。 */
  expectedMasters?: Partial<Record<PartName, { name: string; width?: number; height?: number }>>;
  /** 源模板指纹（探针记录 / 当前实测），用于漂移检查。 */
  expectedFingerprint?: string;
  actualFingerprint?: string;
  /** `verify` 阶段：编译产出的 key（人工可在报告里抄，或由上层传入）。 */
  components?: ComponentKeys;
  write?: boolean;
  backend: FigmaBackend;
}

export interface CompileReport {
  phase: 'compile' | 'verify' | 'contract';
  project: string;
  /** 计划（干跑也有），实跑时带 componentId。 */
  parts: Array<{ part: PartName; name: string; componentId: string | null; key: string | null }>;
  adopted: AdoptOutcome['adopted'];
  sets: AdoptResult['sets'];
  /** 槽位命名归一化的逐条改名（幂等：重编已在统一命名的部件时为空）。 */
  renamed?: SlotRename[];
  /** 空壳化删掉的节点数。 */
  slimmed?: number;
  /** 顶部被清空字符的文本数（原稿残留）。 */
  cleared?: number;
  /** 加上了自适应外壳的部件（幂等：已是自动布局的为空）。 */
  adaptive?: AdaptiveApplied[];
  capabilities: Capabilities;
  diffs: CapabilityDiff[];
  anchors: TemplatePack['anchors'];
  gaps: CompileGap[];
  /** 进门检查逐项结果（粘进来的素材对不对）。 */
  checks: IntakeCheck[];
  templateJson?: TemplatePack;
  /** 人读的书写契约（`verify` / `contract` 阶段返回）。 */
  mdContract?: MdContract;
  written: boolean;
}

export async function compileTemplate(input: CompileInput): Promise<CompileReport> {
  if (input.phase === 'verify') return verifyPhase(input);
  if (input.phase === 'contract') return contractPhase(input);
  return compilePhase(input);
}

/** 给编译各阶段加前缀：真机出错时能直接看出卡在哪一步。 */
async function stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e as Error & { code?: string };
    throw Object.assign(new Error(`[${name}] ${err.message}`), {
      ...(err.code ? { code: err.code } : {})
    });
  }
}

/**
 * 等桥接能应答再开工。
 *
 * 真机现象：部件刚克隆完（簇 1566 节点），插件还在算布局，紧接着的调用被
 * figma-console 直接判「10 秒内连不上」，而插件其实只是忙。这里用一次极小
 * 的读（`getNodeInfo`）反复探，直到它应答为止——探活失败不抛错，只是接着等。
 */
async function waitForBridge(
  backend: FigmaBackend,
  probeNodeId: string,
  timeoutMs = 60000
): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    try {
      await backend.getNodeInfo(probeNodeId);
      return;
    } catch {
      if (Date.now() - startedAt > timeoutMs) return;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

/**
 * 桥接被占住时的重试——**只能给幂等阶段用**。
 *
 * 真机现象：部件刚克隆完（簇 1566 节点），插件还在算布局，紧接着的调用会被
 * figma-console 判成「10 秒内连不上」；换个时间点手动重跑就过了。归一化 / 空壳化
 * / 自适应三个阶段的重复执行结果一致（改名到同一个名字、删已删的节点、布局跳过），
 * 所以可以安全重试。建部件、补标号容器、收编这些**不幂等**，绝不重试。
 */
async function stageRetry<T>(name: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await stage(name, fn);
    } catch (e) {
      last = e;
      const msg = (e as Error).message ?? '';
      const transient = /Unable to establish connection|still busy|timed out/i.test(msg);
      if (!transient || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw last;
}

async function verifyPhase(input: CompileInput): Promise<CompileReport> {
  const keys = input.components ?? {};
  const verified = await verifyPublished({ backend: input.backend, keys });
  const pack = buildTemplatePack({
    project: input.project,
    source: {
      fileKey: input.source.fileKey ?? '',
      nodeIds: [input.source.nodeId],
      ...(input.expectedFingerprint ? { fingerprint: input.expectedFingerprint } : {})
    },
    components: verified,
    capabilities: input.capabilities ?? { ...DEFAULT_CAPABILITIES },
    anchors: {},
    mdContract: MD_CONTRACT_RELATIVE_PATH
  });
  const mdContract = buildMdContract(pack);
  return {
    phase: 'verify',
    project: input.project,
    parts: (Object.keys(verified) as PartName[]).map((p) => ({
      part: p,
      name: `${input.project} / ${PART_LABELS[p]}`,
      componentId: null,
      key: verified[p] ?? null
    })),
    adopted: [],
    sets: [],
    capabilities: pack.capabilities,
    diffs: [],
    anchors: pack.anchors,
    gaps: [],
    checks: [],
    templateJson: pack,
    mdContract,
    written: false
  };
}

/** 只读阶段：按已登记的模板包重新生成 `md-contract.md`，不连 Figma。 */
async function contractPhase(input: CompileInput): Promise<CompileReport> {
  const hit = loadTemplatePack();
  if (!hit) {
    throw compileError(
      COMPILE_CODES.PARTS_NOT_REGISTERED,
      `没有找到「${input.project}」的模板包——先完成编译与回填，再生成书写契约`
    );
  }
  const mdContract = buildMdContract(hit.pack);
  return {
    phase: 'contract',
    project: hit.pack.project ?? input.project,
    parts: (Object.keys(hit.pack.components) as PartName[]).map((p) => ({
      part: p,
      name: `${hit.pack.project ?? input.project} / ${PART_LABELS[p]}`,
      componentId: null,
      key: hit.pack.components[p] ?? null
    })),
    adopted: [],
    sets: [],
    capabilities: hit.pack.capabilities,
    diffs: [],
    anchors: hit.pack.anchors,
    gaps: [],
    checks: [],
    mdContract,
    written: false
  };
}

async function compilePhase(input: CompileInput): Promise<CompileReport> {
  const { backend, project } = input;
  const staged = input.staged ?? {};
  const plan = planParts({ project, staged });
  const gaps: CompileGap[] = [];
  // 同一句话只留一条：planParts / buildParts 都会吐「没有结尾块」。
  const seenGaps = new Set<string>();
  const pushGaps = (more: CompileGap[]) => {
    for (const g of more) {
      if (seenGaps.has(g.what)) continue;
      seenGaps.add(g.what);
      gaps.push(g);
    }
  };
  pushGaps(plan.gaps);
  const source = input.capabilities ?? { ...DEFAULT_CAPABILITIES };

  // 配置错误优先于素材错误：缺落点页面先说清楚，别让人去查粘贴。
  if (input.write && !input.partsPageId) {
    throw compileError(
      COMPILE_CODES.LIBRARY_UNWRITABLE,
      'partsPageId 必填：收编出来的零件需要一个落脚的页面'
    );
  }

  // 进门检查：粘错项目 / 漏粘 / 粘了张截图，都在建组件之前拦掉。
  let checks: IntakeCheck[] = [];
  if (Object.keys(staged).length > 0) {
    try {
      const r = await intake({
        backend,
        staged,
        expected: input.expectedMasters ?? {},
        ...(input.badgeContainerSourceId
          ? { badgeContainerSourceId: input.badgeContainerSourceId }
          : {})
      });
      checks = r.checks;
      gaps.push(...r.gaps);
    } catch (e) {
      if (input.write) throw e;
      gaps.push({
        what: `进门检查未通过：${(e as Error).message}`,
        impact: '干跑仍给出计划，但实跑会被拒绝',
        fix: '按提示重新粘贴或修正 id'
      });
    }
  }

  if (!input.write) {
    return {
      phase: 'compile',
      project,
      parts: plan.steps.map((s) => ({ part: s.part, name: s.name, componentId: null, key: null })),
      adopted: [],
      sets: [],
      capabilities: { ...source },
      diffs: [],
      anchors: {},
      gaps,
      checks,
      written: false
    };
  }

  if (!input.partsPageId) {
    throw compileError(
      COMPILE_CODES.LIBRARY_UNWRITABLE,
      'partsPageId 必填：收编出来的零件需要一个落脚的页面'
    );
  }

  await preflight({
    backend,
    libraryPageId: input.library.pageId,
    ...(input.expectedFingerprint ? { expectedFingerprint: input.expectedFingerprint } : {}),
    ...(input.actualFingerprint ? { actualFingerprint: input.actualFingerprint } : {})
  });

  if (backend.commitUndoCheckpoint) {
    await backend.commitUndoCheckpoint('template-compile');
  }

  const built = await stage('buildParts', () =>
    buildParts({
      project,
      staged,
      pageId: input.library.pageId,
      backend
    })
  );
  pushGaps(built.gaps);

  // 字体归一化：只换字体族，字号 / 行距 / 字色一律不动。
  if (backend.normalizeFontsInSubtree) {
    for (const part of built.built) {
      const r = await stage(`font.${part.part}`, () =>
        backend.normalizeFontsInSubtree!({
          rootId: part.componentId,
          family: COMPILE_FONT_FAMILY,
          weightMap: buildWeightMap()
        })
      );
      if (r.unmapped.length > 0) {
        gaps.push({
          what: `「${part.name}」有 ${r.unmapped.length} 处字重做了就近映射`,
          impact: '视觉字重可能与原模板略有差异',
          fix: '如需精确，改用更多档字体'
        });
      }
    }
  }

  // 标号容器：散落标号的模板补一个 1:14 形态的空容器。
  const chapter = built.built.find((p) => p.part === 'chapter');
  if (chapter) {
    const badge = await stage('badge.container', () =>
      ensureBadgeContainer({
        backend,
        chapterComponentId: chapter.componentId,
        // 源模板本来就带标号容器（badgeSlot=container，如 1:14）时不要补第二个。
        alreadyHasContainer: source.badgeSlot === 'container',
        ...(input.badgeContainerSourceId ? { containerSourceId: input.badgeContainerSourceId } : {})
      })
    );
    gaps.push(...badge.gaps);

    // 收口母版：容器里只留一个隐藏的 `标号/母版`，渲染期克隆它生成标号。
    const master = await stage('badge.master', () =>
      ensureBadgeMaster({
        backend,
        chapterComponentId: chapter.componentId,
        ...(badge.containerId ? { containerId: badge.containerId } : {})
      })
    );
    gaps.push(...master.gaps);
  }

  const adopted = await stage('adopt', () =>
    adoptNestedParts({
      backend,
      parts: built.built,
      partsPageId: input.partsPageId ?? input.library.pageId,
      project
    })
  );
  gaps.push(...adopted.gaps);

  // 槽位命名归一化：渲染只按统一名取值，名字在这里一次改好（已是统一名则零改动）。
  // 先探活：部件刚克隆完时插件常还在算布局，直接开工会被判「连不上」。
  await waitForBridge(backend, built.built[0]?.componentId ?? input.library.pageId);
  const normalized = await stageRetry('normalize', () =>
    normalizeSlotNames({
      backend,
      parts: built.built.map((p) => ({ part: p.part, nodeId: p.componentId })),
      capabilities: source
    })
  );
  pushGaps(normalized.gaps);

  // 空壳化：把克隆母版带进来的原稿簇 / 多余内容行删掉，只留样式载体。
  // 不做的后果是真机渲染时插件在大树里扫描删除，直接断连（蛋仔 7235 节点）。
  const slim = await stageRetry('slim', () =>
    slimParts({
      backend,
      parts: built.built.map((p) => ({ part: p.part, nodeId: p.componentId })),
      capabilities: source
    })
  );
  pushGaps(slim.gaps);

  // 自适应外壳：把根框接回 HUG 链，渲染期就不用再量一遍子级压高度。
  await waitForBridge(backend, built.built[0]?.componentId ?? input.library.pageId);
  const adaptive = await stageRetry('adaptive', () =>
    applyAdaptiveLayout({
      backend,
      parts: built.built.map((p) => ({ part: p.part, nodeId: p.componentId }))
    })
  );
  pushGaps(adaptive.gaps);

  // 产物能力重算：配置必须描述产物，而不是源模板。
  const treeOf = async (part: PartName): Promise<ProbeTree | undefined> => {
    const hit = built.built.find((b) => b.part === part);
    if (!hit || typeof backend.scanSubtree !== 'function') return undefined;
    const scan = await backend.scanSubtree(hit.componentId, 6000);
    return buildProbeTree(scan.nodes, hit.componentId, scan.truncated);
  };
  const topTree = await treeOf('top');
  const chapterTree = await treeOf('chapter');
  const verdict = deriveCapabilities({
    ...(topTree ? { top: topTree } : {}),
    ...(chapterTree ? { chapter: chapterTree } : {}),
    source
  });
  gaps.push(...verdict.gaps);

  // 排版：编译默认把组件都落在 (0,0) 上互相遮挡，人打开库看不清有没有齐。
  if (backend.arrangePageChildren) {
    await backend.arrangePageChildren({ pageId: input.library.pageId });
    await backend.arrangePageChildren({ pageId: input.partsPageId });
  }

  return {
    phase: 'compile',
    project,
    parts: built.built.map((b) => ({
      part: b.part,
      name: b.name,
      componentId: b.componentId,
      key: null
    })),
    adopted: adopted.adopted,
    sets: adopted.sets,
    renamed: normalized.renamed,
    slimmed: slim.deleted,
    cleared: slim.cleared,
    adaptive: adaptive.applied,
    capabilities: verdict.capabilities,
    diffs: verdict.diffs,
    anchors: {},
    gaps,
    checks,
    written: true
  };
}
