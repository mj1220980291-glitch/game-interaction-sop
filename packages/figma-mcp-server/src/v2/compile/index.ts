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
import { ensureBadgeContainer } from './badge-container.js';
import { buildTemplatePack, verifyPublished, type ComponentKeys } from './backfill.js';
import type { CompileGap } from './errors.js';
import { buildWeightMap, COMPILE_FONT_FAMILY } from './font-normalize.js';
import { buildParts, planParts, type PartName } from './parts.js';
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
      nodeIds: [input.source.nodeId]
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
      name: `${input.project} / ${p}`,
      componentId: null,
      key: verified[p] ?? null
    })),
    adopted: [],
    sets: [],
    capabilities: pack.capabilities,
    diffs: [],
    anchors: pack.anchors,
    gaps: [],
    templateJson: pack,
    written: false
  };
}

async function compilePhase(input: CompileInput): Promise<CompileReport> {
  const { backend, project } = input;
  const staged = input.staged ?? {};
  const plan = planParts({ project, staged });
  const gaps: CompileGap[] = [...plan.gaps];
  const source = input.capabilities ?? { ...DEFAULT_CAPABILITIES };

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
  gaps.push(...built.gaps);

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
    written: true
  };
}
