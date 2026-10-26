/**
 * 产物能力重算 — `capabilities` 描述的是**归一化模板**，不是项目源模板。
 *
 * 为什么必须重算：编译会改变结构（编号载体可能从实例变成本库组件、隐藏池被
 * 收编）。如果配置还写着源模板的判定，渲染分支就会错位——比如配置说
 * `numberBadge: instance`，实物却是普通文字，渲染器会去找一个不存在的实例。
 *
 * 判定逻辑一律复用探针（`probe/detect.ts`），不在编译里另写一套。
 *
 * Spec: openspec/changes/template-compile-to-library (D5)
 */

import type { Capabilities, CapabilityKey } from '../template/schema.js';
import {
  detect,
  detectColumn,
  detectFigure,
  detectHiddenPool,
  detectOverview,
  detectRoleHabit
} from '../probe/detect.js';
import type { ProbeTree } from '../probe/tree.js';
import type { CompileGap } from './errors.js';

export interface CapabilityDiff {
  key: CapabilityKey;
  from: Capabilities[CapabilityKey];
  to: Capabilities[CapabilityKey];
}

export interface CapabilityVerdict {
  capabilities: Capabilities;
  /** 产物与源模板不一致的项。 */
  diffs: CapabilityDiff[];
  gaps: CompileGap[];
}

/** 逐项比对，产出差异清单。 */
export function diffCapabilities(
  source: Capabilities,
  produced: Capabilities
): CapabilityDiff[] {
  const out: CapabilityDiff[] = [];
  for (const key of Object.keys(source) as CapabilityKey[]) {
    if (source[key] !== produced[key]) {
      out.push({ key, from: source[key], to: produced[key] } as CapabilityDiff);
    }
  }
  return out;
}

/**
 * 依据产物部件重算能力。
 *
 * 只重算"部件本身能作证"的项；部件里看不出来的（例如整篇才有的总览布局），
 * 保留源模板结论并**记一条缺口**，不假装是实测值。
 */
export function deriveCapabilities(input: {
  top?: ProbeTree;
  chapter?: ProbeTree;
  source: Capabilities;
}): CapabilityVerdict {
  const caps: Capabilities = { ...input.source };
  const gaps: CompileGap[] = [];
  const undecidable: string[] = [];

  const chapterDetect = input.chapter ? detect(input.chapter) : undefined;

  if (input.top) {
    caps.overview = detectOverview(input.top, []);
    caps.roleAnnotation = detectRoleHabit(input.top);
  } else {
    undecidable.push('overview', 'roleAnnotation');
  }

  if (chapterDetect) {
    caps.column = detectColumn(chapterDetect.chapters);
    caps.figure = detectFigure(chapterDetect.clusters);
    caps.hiddenPool = detectHiddenPool(chapterDetect.clusters);

    if (chapterDetect.clusters.length === 0) {
      undecidable.push('numberBadge', 'badgeSlot', 'clusterGroups');
    } else {
      const kinds = chapterDetect.clusters.map((c) => c.numberKind);
      caps.numberBadge = kinds.includes('instance')
        ? 'instance'
        : kinds.includes('text')
          ? 'text'
          : 'none';
      caps.badgeSlot = chapterDetect.badgeGroup
        ? 'container'
        : kinds.some((k) => k !== 'none')
          ? 'manual'
          : 'none';
      caps.clusterGroups = chapterDetect.subrunGroup
        ? 'slot-run'
        : caps.clusterGroups === 'inline-subtitle'
          ? 'inline-subtitle'
          : 'slot-run';
      if (!chapterDetect.subrunGroup && caps.clusterGroups === 'slot-run') {
        undecidable.push('clusterGroups');
      }
    }
  } else {
    undecidable.push('column', 'figure', 'hiddenPool', 'numberBadge', 'badgeSlot', 'clusterGroups');
  }

  const diffs = diffCapabilities(input.source, caps);

  for (const d of diffs) {
    gaps.push({
      what: `能力项 ${d.key}：源模板 ${String(d.from)} → 产物 ${String(d.to)}`,
      impact: '渲染按产物值走分支；配置与实物一致',
      fix: '无需处理，知悉即可'
    });
  }

  if (undecidable.length > 0) {
    gaps.push({
      what: `这些能力项无法从部件实测：${undecidable.join('、')}`,
      impact: '沿用源模板判定（source: default），可能与产物略有出入',
      fix: '渲染变更落地时按实际结构复核'
    });
  }

  return { capabilities: caps, diffs, gaps };
}
