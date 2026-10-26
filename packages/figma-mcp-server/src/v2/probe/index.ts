/**
 * Template probe — read a project's own Figma template and answer one
 * question: can we render with it, and with which strategies?
 *
 * Read-only by construction: the only backend method used is `scanSubtree`.
 *
 * Spec: openspec/changes/template-contract-and-probe/specs/template-probe/spec.md
 */

import type { FigmaBackend, NodeInfo } from '../figma-client.js';
import {
  CAPABILITY_KEYS,
  DEFAULT_CAPABILITIES,
  TEMPLATE_PACK_SCHEMA_VERSION,
  type Capabilities,
  type CapabilityKey,
  type TemplatePack
} from '../template/schema.js';
import {
  detect,
  detectBadgePlacement,
  detectColumn,
  detectFigure,
  detectHiddenPool,
  detectOverview,
  detectRoleHabit,
  type DetectionResult,
  type MasterRef
} from './detect.js';
import { structuralFingerprint } from './fingerprint.js';
import { buildProbeTree, descendants, type ProbeNode, type ProbeTree } from './tree.js';

export type CapabilitySource = 'probed' | 'inferred' | 'default';

export interface CapabilityFinding {
  value: Capabilities[CapabilityKey];
  source: CapabilitySource;
  note?: string;
}

export type RuleId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6';

export interface RuleResult {
  id: RuleId;
  ok: boolean;
  detail: string;
}

export interface ProbeGap {
  what: string;
  impact: string;
  fix: string;
}

export interface ProbeDraft {
  schema_version: number;
  /** Present only when the probe knew the file key. */
  source?: { fileKey: string; nodeIds: string[]; fingerprint: string };
  components: TemplatePack['components'];
  capabilities: Capabilities;
  anchors: TemplatePack['anchors'];
}

export type ProbeVerdict = 'ready' | 'needs-anchor' | 'non-conformant';

export interface ProbeReport {
  verdict: ProbeVerdict;
  rules: RuleResult[];
  masters: {
    top?: { nodeId: string; name: string };
    chapter?: MasterRef;
    cluster?: MasterRef;
    footer?: { nodeId: string; name: string };
  };
  capabilities: Record<CapabilityKey, CapabilityFinding>;
  gaps: ProbeGap[];
  draft: ProbeDraft;
  fingerprint: string;
  human: string;
  source: {
    fileKey?: string;
    nodeId: string;
    nodeName: string;
    nodeCount: number;
    truncated: boolean;
  };
}

export interface ProbeMeta {
  nodeId: string;
  nodeName: string;
  fileKey?: string;
}

export interface ProbeTemplateInput {
  nodeId: string;
  fileKey?: string;
  backend: FigmaBackend;
  /** Node budget for the single subtree scan. Defaults to 20000. */
  maxNodes?: number;
}

/**
 * One subtree scan, with a smaller retry.
 *
 * A 14k-node document takes ~17s to serialise inside the plugin; on a slow
 * connection that can blow the RPC budget. Retrying at a quarter of the budget
 * still yields the upper levels (the scan is BFS), so structure detection
 * survives — the report just downgrades to `needs-anchor` and says so.
 */
async function scanWithFallback(
  backend: FigmaBackend,
  nodeId: string,
  maxNodes: number
): Promise<{ nodes: NodeInfo[]; truncated: boolean; fallbackBudget?: number }> {
  try {
    const r = await backend.scanSubtree(nodeId, maxNodes);
    return { nodes: r.nodes, truncated: r.truncated };
  } catch {
    const smaller = Math.max(2000, Math.floor(maxNodes / 4));
    const r = await backend.scanSubtree(nodeId, smaller);
    return { nodes: r.nodes, truncated: true, fallbackBudget: smaller };
  }
}

// --- capability assembly -------------------------------------------------

function finding(
  value: Capabilities[CapabilityKey],
  source: CapabilitySource,
  note?: string
): CapabilityFinding {
  return note ? { value, source, note } : { value, source };
}

function assembleCapabilities(d: DetectionResult, tree: ProbeTree): Record<CapabilityKey, CapabilityFinding> {
  const hasClusters = d.clusters.length > 0;
  const structural: CapabilitySource = tree.truncated ? 'inferred' : 'probed';

  const numberBadge: Capabilities['numberBadge'] = d.clusters.some((c) => c.numberKind === 'instance')
    ? 'instance'
    : d.clusters.some((c) => c.numberKind === 'text')
      ? 'text'
      : 'none';

  const badgeSlot: Capabilities['badgeSlot'] = !hasClusters
    ? 'none'
    : detectBadgePlacement(tree, d.chapters);

  const clusterGroups: Capabilities['clusterGroups'] = !hasClusters
    ? 'none'
    : (d.subrunGroup?.members.length ?? 0) >= 2
      ? 'slot-run'
      : d.subrunGroup
        ? 'inline-subtitle'
        : 'none';

  return {
    overview: finding(detectOverview(tree, d.chapters), structural),
    clusterGroups: hasClusters
      ? finding(clusterGroups, structural)
      : finding(DEFAULT_CAPABILITIES.clusterGroups, 'default', '未识别到簇，按缺省'),
    badgeSlot: hasClusters
      ? finding(badgeSlot, structural)
      : finding(DEFAULT_CAPABILITIES.badgeSlot, 'default', '未识别到簇，按缺省'),
    numberBadge: hasClusters
      ? finding(numberBadge, numberBadge === 'none' ? 'inferred' : structural)
      : finding(DEFAULT_CAPABILITIES.numberBadge, 'default', '未识别到簇，按缺省'),
    roleAnnotation: finding(detectRoleHabit(tree), structural),
    figure: hasClusters
      ? finding(detectFigure(d.clusters), structural)
      : finding(DEFAULT_CAPABILITIES.figure, 'default', '未识别到簇，按缺省'),
    hiddenPool: hasClusters
      ? finding(detectHiddenPool(d.clusters), structural)
      : finding(DEFAULT_CAPABILITIES.hiddenPool, 'default', '未识别到簇，按缺省'),
    column: d.chapters.length > 0 ? finding(detectColumn(d.chapters), structural) : finding(DEFAULT_CAPABILITIES.column, 'default', '未识别到章节，按缺省')
  };
}

// --- footer --------------------------------------------------------------

function findFooter(tree: ProbeTree): { nodeId: string; name: string } | undefined {
  const all = descendants(tree.root).filter((node) => {
    const label = `${node.name} ${node.characters ?? ''}`.toLowerCase();
    return /the\s*end|^end\b|结尾/.test(label.trim());
  });
  // Prefer the container named `end` over the TEXT reading "the end.".
  const containers = all.filter((n) => n.type !== 'TEXT');
  const picked = (containers.length > 0 ? containers : all).at(-1);
  return picked ? { nodeId: picked.id, name: picked.name } : undefined;
}

// --- rules ---------------------------------------------------------------

function evaluateRules(d: DetectionResult, caps: Record<CapabilityKey, CapabilityFinding>): RuleResult[] {
  const chapters = d.chapters.length;
  const clusters = d.clusters;
  const titlesOk = clusters.length > 0 && clusters.every((c) => Boolean(c.title));
  const linesOk = clusters.length > 0 && clusters.every((c) => c.contentLines.length >= 1);
  const numbersOk = clusters.length > 0 && clusters.every((c) => c.numberKind !== 'none');

  return [
    {
      id: 'F1',
      ok: Boolean(d.top),
      detail: d.top ? `顶部区 = ${d.top.name} [${d.top.id}]` : '未找到含 ≥2 个短标签的顶部元信息区'
    },
    {
      id: 'F2',
      ok: chapters > 0,
      detail: chapters > 0 ? `章节 = ${chapters} 个（图示 + 说明）` : '未找到「图片 + 说明」章节单元'
    },
    {
      id: 'F3',
      ok: clusters.length > 0,
      detail: clusters.length > 0 ? `簇 = ${clusters.length} 个` : '说明容器内未找到簇单元'
    },
    {
      id: 'F4',
      ok: titlesOk && linesOk && (numbersOk || caps.numberBadge.value === 'none'),
      detail:
        clusters.length === 0
          ? '无簇可判'
          : `标题 ${clusters.filter((c) => c.title).length}/${clusters.length}，` +
            `内容行 ${clusters.filter((c) => c.contentLines.length >= 1).length}/${clusters.length}，` +
            `编号 ${clusters.filter((c) => c.numberKind !== 'none').length}/${clusters.length}`
    },
    {
      id: 'F5',
      ok: Boolean(d.chapterMaster) && d.chapterMaster?.kind !== 'single',
      detail: d.chapterMaster ? `章节母版 = ${d.chapterMaster.name} [${d.chapterMaster.nodeId}] (${d.chapterMaster.kind})` : '未找到章节母版'
    },
    {
      id: 'F6',
      ok: Boolean(d.clusterMaster) && d.clusterMaster?.kind !== 'single',
      detail: d.clusterMaster ? `簇母版 = ${d.clusterMaster.name} [${d.clusterMaster.nodeId}] (${d.clusterMaster.kind})` : '未找到簇母版'
    }
  ];
}

function decideVerdict(rules: RuleResult[]): ProbeVerdict {
  const hard = rules.filter((r) => r.id === 'F1' || r.id === 'F2' || r.id === 'F3' || r.id === 'F4');
  if (hard.some((r) => !r.ok)) return 'non-conformant';
  return rules.every((r) => r.ok) ? 'ready' : 'needs-anchor';
}

function collectGaps(rules: RuleResult[], caps: Record<CapabilityKey, CapabilityFinding>): ProbeGap[] {
  const gaps: ProbeGap[] = [];
  for (const rule of rules) {
    if (!rule.ok) gaps.push({ what: `${rule.id} 未通过`, impact: rule.detail, fix: '补锚点或改模板结构' });
  }
  for (const key of CAPABILITY_KEYS) {
    const f = caps[key];
    if (f.source === 'default' || f.source === 'inferred') {
      gaps.push({
        what: `${key} 只能推断（${String(f.value)}）`,
        impact: f.note ?? '结论未实测，需人确认后才能编译',
        fix: '人工确认后在 template.json 里固定该值'
      });
    }
  }
  if (caps.badgeSlot.value === 'manual') {
    gaps.push({
      what: '图上标号没有独立容器',
      impact: 'badgeSlot=manual：引擎无法按坐标自动摆放标号',
      fix: '渲染时人工摆位，或渲染后由人拖动标号'
    });
  }
  return gaps;
}

// --- human report --------------------------------------------------------

function renderHuman(report: Omit<ProbeReport, 'human'>): string {
  const lines: string[] = [];
  const mark = (ok: boolean) => (ok ? '✅' : '❌');
  lines.push(`模板体检：${report.source.nodeName} / ${report.source.nodeId}`);
  lines.push('');
  for (const r of report.rules) lines.push(`${mark(r.ok)} ${r.id} ${r.detail}`);
  lines.push('');
  const m = report.masters;
  lines.push(`母版：章节 ${m.chapter ? `${m.chapter.name} [${m.chapter.nodeId}] (${m.chapter.kind})` : '未找到'}`);
  lines.push(`      簇   ${m.cluster ? `${m.cluster.name} [${m.cluster.nodeId}] (${m.cluster.kind})` : '未找到'}`);
  if (m.footer) lines.push(`      结尾 ${m.footer.name} [${m.footer.nodeId}]`);
  lines.push('');
  lines.push('能力：');
  for (const key of CAPABILITY_KEYS) {
    const f = report.capabilities[key];
    lines.push(`  ${key.padEnd(15)} ${String(f.value).padEnd(18)} ${f.source}`);
  }
  lines.push('');
  if (report.gaps.length > 0) {
    lines.push('缺口：');
    for (const g of report.gaps) lines.push(`  · ${g.what} → ${g.impact}（${g.fix}）`);
    lines.push('');
  }
  lines.push(
    report.verdict === 'ready'
      ? '结论：ready —— 可接，改 0 处'
      : report.verdict === 'needs-anchor'
        ? '结论：needs-anchor —— 可接，但需要补 / 确认锚点'
        : '结论：non-conformant —— 铁律不满足，不能接'
  );
  return lines.join('\n');
}

/** Build a report from an already-built probe tree. */
export function probeFromTree(tree: ProbeTree, meta: ProbeMeta): ProbeReport {
  const detection = detect(tree);
  const capabilities = assembleCapabilities(detection, tree);
  const rules = evaluateRules(detection, capabilities);
  const decided = decideVerdict(rules);
  const verdict = tree.truncated && decided === 'ready' ? 'needs-anchor' : decided;
  const gaps = collectGaps(rules, capabilities);
  if (tree.truncated) {
    gaps.push({
      what: '节点扫描被截断',
      impact: '结构判定可能不完整',
      fix: '提高 maxNodes 重跑探针'
    });
  }
  const fingerprint = structuralFingerprint(tree);
  const footer = findFooter(tree);

  const base = {
    verdict,
    rules,
    masters: {
      ...(detection.top ? { top: { nodeId: detection.top.id, name: detection.top.name } } : {}),
      ...(detection.chapterMaster ? { chapter: detection.chapterMaster } : {}),
      ...(detection.clusterMaster ? { cluster: detection.clusterMaster } : {}),
      ...(footer ? { footer } : {})
    },
    capabilities,
    gaps,
    draft: {
      schema_version: TEMPLATE_PACK_SCHEMA_VERSION,
      // `source` needs a fileKey to be a valid pack; omit it when probing the
      // active file without one, rather than emitting an unparseable draft.
      ...(meta.fileKey
        ? { source: { fileKey: meta.fileKey, nodeIds: [meta.nodeId], fingerprint } }
        : {}),
      // Filled by the compile/publish step; the probe never invents keys.
      components: { top: null, chapter: null, cluster: null, footer: null },
      capabilities: Object.fromEntries(
        CAPABILITY_KEYS.map((k) => [k, capabilities[k].value])
      ) as unknown as Capabilities,
      anchors: {}
    } satisfies ProbeDraft,
    fingerprint,
    source: {
      ...(meta.fileKey ? { fileKey: meta.fileKey } : {}),
      nodeId: meta.nodeId,
      nodeName: meta.nodeName,
      nodeCount: tree.byId.size,
      truncated: tree.truncated
    }
  };
  return { ...base, human: renderHuman(base as Omit<ProbeReport, 'human'>) };
}

function probeError(code: string, message: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

/**
 * Probe a template in the connected file. Read-only: `scanSubtree` is the only
 * backend call, so no write path can be reached from here.
 */
export async function probeTemplate(input: ProbeTemplateInput): Promise<ProbeReport> {
  const backend = input.fileKey && input.backend.withFileKey
    ? input.backend.withFileKey(input.fileKey)
    : input.backend;

  let root: NodeInfo;
  try {
    root = await backend.getNodeInfo(input.nodeId);
  } catch {
    throw probeError(
      'V2_PROBE_NODE_NOT_FOUND',
      `节点 ${input.nodeId} 不存在或不可访问（fileKey=${input.fileKey ?? '当前连接文件'}）`
    );
  }
  if (!root?.id) {
    throw probeError('V2_PROBE_NODE_NOT_FOUND', `节点 ${input.nodeId} 不存在或不可访问`);
  }

  const budget = input.maxNodes ?? 20000;
  const scan = await scanWithFallback(backend, input.nodeId, budget);
  const tree: ProbeTree | undefined = buildProbeTree(scan.nodes, input.nodeId, scan.truncated);
  if (!tree) {
    throw probeError('V2_PROBE_NODE_NOT_FOUND', `节点 ${input.nodeId} 不在扫描结果中`);
  }

  const report = probeFromTree(tree, {
    nodeId: input.nodeId,
    nodeName: root.name,
    ...(input.fileKey ? { fileKey: input.fileKey } : {})
  });
  if (scan.fallbackBudget) {
    report.gaps.push({
      what: `整棵扫描超时，已回退到 ${scan.fallbackBudget} 节点预算`,
      impact: '只覆盖上层结构，结论按 needs-anchor 处理',
      fix: '网络稳定后用较小的 maxNodes 重跑，或先把模板复制到独立文件再探针'
    });
  }
  return report;
}

export function isProbeReport(v: unknown): v is ProbeReport {
  return typeof v === 'object' && v !== null && 'verdict' in v && 'rules' in v;
}

export type { ProbeNode };
