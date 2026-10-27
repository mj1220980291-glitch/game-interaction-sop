/**
 * 进门检查 — 人工粘完之后、动手建组件之前，先核对素材对不对。
 *
 * 为什么需要：粘贴是整条链路唯一的人工环节，最容易出错的是「粘错项目」
 * 「漏粘一块」「粘了个屏截图当章节」。这些错误如果等到建完组件才发现，
 * 清理成本高得多；而且建了一半的组件会污染库。
 *
 * 判据来自探针：母版的名字、尺寸、类型都是实测记下来的，直接拿来对。
 * 名字对不上只提醒（人可能为了辨认改过名），**尺寸对不上就拒绝**。
 *
 * Spec: openspec/changes/template-compile-to-library (4.x)
 */

import type { FigmaBackend, FigmaNodeType } from '../figma-client.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';
import { PART_LABELS, type PartName } from './parts.js';

export interface ExpectedPart {
  /** 探针记录的母版名。 */
  name: string;
  /** 探针记录的尺寸；缺省则跳过尺寸核对。 */
  width?: number;
  height?: number;
}

export interface IntakeInput {
  backend: FigmaBackend;
  staged: Partial<Record<PartName, string>>;
  /** 探针给出的母版信息，按部件索引。 */
  expected: Partial<Record<PartName, ExpectedPart>>;
  /** 散落标号模板需要的「气泡」来源。 */
  badgeContainerSourceId?: string;
  /** 尺寸容差，缺省 4px。 */
  tolerance?: number;
}

export interface IntakeCheck {
  part: PartName | 'badge';
  ok: boolean;
  detail: string;
}

export interface IntakeResult {
  ok: boolean;
  checks: IntakeCheck[];
  gaps: CompileGap[];
}

/** 允许被转成组件的节点类型。 */
const CONVERTIBLE: readonly FigmaNodeType[] = ['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'];

export async function intake(input: IntakeInput): Promise<IntakeResult> {
  const tolerance = input.tolerance ?? 4;
  const checks: IntakeCheck[] = [];
  const gaps: CompileGap[] = [];
  let ok = true;

  for (const part of Object.keys(input.staged) as PartName[]) {
    const nodeId = input.staged[part];
    if (!nodeId) continue;
    const expected = input.expected[part];

    let info;
    try {
      info = await input.backend.getNodeInfo(nodeId);
    } catch {
      ok = false;
      checks.push({ part, ok: false, detail: `节点 ${nodeId} 在库文件里找不到` });
      continue;
    }

    if (!CONVERTIBLE.includes(info.type)) {
      ok = false;
      checks.push({
        part,
        ok: false,
        detail: `类型 ${info.type} 不能转成组件（需要 FRAME / GROUP / COMPONENT）`
      });
      continue;
    }

    if (expected?.width != null && expected.height != null) {
      const w = info.absoluteBoundingBox?.width ?? 0;
      const h = info.absoluteBoundingBox?.height ?? 0;
      const dw = Math.abs(w - expected.width);
      const dh = Math.abs(h - expected.height);
      if (dw > tolerance || dh > tolerance) {
        ok = false;
        checks.push({
          part,
          ok: false,
          detail:
            `尺寸对不上：粘进来 ${Math.round(w)}×${Math.round(h)}，` +
            `探针记录 ${Math.round(expected.width)}×${Math.round(expected.height)}` +
            '——八成粘的是别的项目或别的块'
        });
        continue;
      }
    }

    if (expected?.name && info.name !== expected.name) {
      gaps.push({
        what: `「${PART_LABELS[part]}」粘进来的名字是「${info.name}」，探针记录是「${expected.name}」`,
        impact: '不影响编译（按 id 取），但报告里不好对照',
        fix: '无'
      });
    }

    checks.push({
      part,
      ok: true,
      detail: `${info.name} ${Math.round(info.absoluteBoundingBox?.width ?? 0)}×${Math.round(
        info.absoluteBoundingBox?.height ?? 0
      )}`
    });
  }

  for (const part of ['top', 'chapter', 'cluster'] as PartName[]) {
    if (!input.staged[part]) {
      ok = false;
      checks.push({ part, ok: false, detail: `缺「${PART_LABELS[part]}」，没有粘` });
    }
  }

  if (input.badgeContainerSourceId) {
    try {
      const bubble = await input.backend.getNodeInfo(input.badgeContainerSourceId);
      if (bubble.type !== 'FRAME') {
        ok = false;
        checks.push({ part: 'badge', ok: false, detail: `标号容器应是 FRAME，实际 ${bubble.type}` });
      } else {
        checks.push({ part: 'badge', ok: true, detail: `${bubble.name} 可用作标号容器` });
      }
    } catch {
      ok = false;
      checks.push({ part: 'badge', ok: false, detail: '标号容器节点找不到' });
    }
  }

  if (!ok) {
    const failed = checks.filter((c) => !c.ok).map((c) => `${PART_LABELS[c.part as PartName] ?? c.part}：${c.detail}`);
    throw compileError(
      COMPILE_CODES.STAGED_PART_MISMATCH,
      `粘进来的素材对不上，先别建组件：${failed.join('；')}`
    );
  }

  return { ok, checks, gaps };
}
