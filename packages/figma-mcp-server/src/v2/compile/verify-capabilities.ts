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
    // 单看顶部部件时，`none` 不是证据：1:14 的总览区证实起来要整棵树。
    // 判不出就保留源模板结论，别把 two-frames 打成 none。
    const overview = detectOverview(input.top, []);
    if (overview !== 'none') caps.overview = overview;
    else if (caps.overview !== 'none') undecidable.push('overview');
    // 职能写法的主证据经常不在顶部：796 是句内 `@GUI@程序`，证据在章节里。
    // 顶部只看到「没有成组 @」时不能据此判定 none，保留源模板结论。
    const habit = detectRoleHabit(input.top);
    if (habit !== 'none') caps.roleAnnotation = habit;
    else if (caps.roleAnnotation !== 'inline-suffix') undecidable.push('roleAnnotation');
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
      // `subrunGroup` 是「簇内第二级」的唯一硬证据。看不到就保留源模板结论——
      // 单看一个簇部件，扁平行序列很容易被误判成 slot run。
      if (chapterDetect.subrunGroup) {
        caps.clusterGroups = 'slot-run';
      } else if (caps.clusterGroups === 'slot-run') {
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
