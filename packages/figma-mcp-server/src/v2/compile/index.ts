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
import { intake, type IntakeCheck } from './intake.js';
import { ensureBadgeContainer } from './badge-container.js';
import { buildTemplatePack, verifyPublished, type ComponentKeys } from './backfill.js';
import type { CompileGap } from './errors.js';
import { buildWeightMap, COMPILE_FONT_FAMILY } from './font-normalize.js';
import { buildParts, PART_LABELS, planParts, type PartName } from './parts.js';
import { preflight } from './preflight.js';
import { deriveCapabilities, type CapabilityDiff } from './verify-capabilities.js';
import { COMPILE_CODES, compileError } from './errors.js';

export interface CompileInput {
  phase: 'compile' | 'verify';
  source: { fileKey?: string; nodeId: string };
  library: { fileKey: string; pageId: string };
  project: string;
  /** `_staging` 页上人工粘好的部件节点 id。 */
  staged?: Partial<Record<PartName, string>>;
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
  phase: 'compile' | 'verify';
  project: string;
  /** 计划（干跑也有），实跑时带 componentId。 */
  parts: Array<{ part: PartName; name: string; componentId: string | null; key: string | null }>;
  adopted: AdoptOutcome['adopted'];
  sets: AdoptResult['sets'];
  capabilities: Capabilities;
  diffs: CapabilityDiff[];
  anchors: TemplatePack['anchors'];
  gaps: CompileGap[];
  /** 进门检查逐项结果（粘进来的素材对不对）。 */
  checks: IntakeCheck[];
  templateJson?: TemplatePack;
  written: boolean;
}

export async function compileTemplate(input: CompileInput): Promise<CompileReport> {
  if (input.phase === 'verify') return verifyPhase(input);
  return compilePhase(input);
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
    anchors: {}
  });
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

  const built = await buildParts({
    project,
    staged,
    pageId: input.library.pageId,
    backend
  });
  pushGaps(built.gaps);

  // 字体归一化：只换字体族，字号 / 行距 / 字色一律不动。
  if (backend.normalizeFontsInSubtree) {
    for (const part of built.built) {
      const r = await backend.normalizeFontsInSubtree({
        rootId: part.componentId,
        family: COMPILE_FONT_FAMILY,
        weightMap: buildWeightMap()
      });
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
    const badge = await ensureBadgeContainer({
      backend,
      chapterComponentId: chapter.componentId,
      // 源模板本来就带标号容器（badgeSlot=container，如 1:14）时不要补第二个。
      alreadyHasContainer: source.badgeSlot === 'container',
      ...(input.badgeContainerSourceId ? { containerSourceId: input.badgeContainerSourceId } : {})
    });
    gaps.push(...badge.gaps);
  }

  const adopted = await adoptNestedParts({
    backend,
    parts: built.built,
    partsPageId: input.partsPageId,
    project
  });
  gaps.push(...adopted.gaps);

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
    capabilities: verdict.capabilities,
    diffs: verdict.diffs,
    anchors: {},
    gaps,
    checks,
    written: true
  };
}
