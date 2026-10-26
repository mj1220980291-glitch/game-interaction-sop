/**
 * 收编（adopt）— 把部件里套着的**别人家**组件实例，变成我们库自己的组件。
 *
 * 为什么必须做：`798` 的「标签」职能图例、「num」三角编号本身是别的文件的
 * 组件实例。原样留在库里，对方删组件 / 改名 / 挪文件，我们这边立刻变灰框，
 * 而且这条失效在编译期完全不可见，只在渲染时炸。
 *
 * 为什么不是"敲成死图形"：编号要能被用户填新数字、图例要能按职能切换，
 * 敲死就没了这两个能力。收编 = 保组件语义 + 不依赖外人。
 *
 * 顺序硬约束：先发零件、后发部件（父引用子，同库内自家 key 稳定）。
 *
 * Spec: openspec/changes/template-compile-to-library (D3)
 */

import type { AdoptResult, AdoptedComponent, FigmaBackend } from '../figma-client.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';
import type { BuiltPart } from './parts.js';

export interface AdoptNestedPartsInput {
  backend: FigmaBackend;
  /** 已建好的 4 个部件组件。 */
  parts: BuiltPart[];
  /** 库文件里放收编零件的页面 id。 */
  partsPageId: string;
  project: string;
  /** 内容闸门尺寸，缺省 600×400（超过即视为截图类内容）。 */
  contentSize?: { width: number; height: number };
}

export interface AdoptOutcome {
  adopted: AdoptedComponent[];
  sets: AdoptResult['sets'];
  gaps: CompileGap[];
  /** 没能处理的实例（按节点列出原因）——非空即视为编译不可交付。 */
  unresolved: AdoptResult['unresolved'];
  /** 原组件 id → 本库组件 id，重编时可复用。 */
  mapping: Record<string, string>;
  /** 被判为「项目原稿内容」而跳过收编的实例（渲染时会被替换）。 */
  skipped: AdoptResult['skipped'];
}

/** 变体名必须能解析成 `属性=值`，否则重新合成的组件集没有可切换的变体属性。 */
function hasVariantSyntax(name: string): boolean {
  return /^[^=]+=.+/.test(name);
}

export async function adoptNestedParts(input: AdoptNestedPartsInput): Promise<AdoptOutcome> {
  const { backend } = input;

  if (typeof backend.adoptInstances !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前 Figma 后端不支持 adoptInstances——无法把嵌套零件收编成自有组件'
    );
  }

  const adopted: AdoptedComponent[] = [];
  const sets: AdoptResult['sets'] = [];
  const unresolved: AdoptResult['unresolved'] = [];
  const gaps: CompileGap[] = [];
  // 跨部件复用：同一个源组件（例如 num 三角）只收编一次，
  // 否则 4 个部件里出现几百个实例就会造出几百个重复组件。
  const mapping: Record<string, string> = {};
  const skipped: AdoptResult['skipped'] = [];

  for (const part of input.parts) {
    const r = await backend.adoptInstances({
      rootId: part.componentId,
      partsPageId: input.partsPageId,
      project: input.project,
      reuse: mapping,
      ...(input.contentSize ? { contentSize: input.contentSize } : {})
    });
    adopted.push(...r.adopted);
    sets.push(...r.sets);
    unresolved.push(...r.unresolved);
    skipped.push(...r.skipped);
    Object.assign(mapping, r.mapping ?? {});
  }

  for (const set of sets) {
    const bad = set.variants.filter((v) => !hasVariantSyntax(v));
    if (bad.length > 0) {
      gaps.push({
        what: `组件集「${set.name}」的变体名不是 属性=值 形式：${bad.join('、')}`,
        impact: '渲染期无法按职能切换变体，只能固定用第一个',
        fix: '在库里把变体名改成 职能=策划 这类形式'
      });
    }
  }

  for (const u of unresolved) {
    gaps.push({
      what: `嵌套实例 ${u.nodeId} 未收编：${u.reason}`,
      impact: '该处仍引用外部组件，源组件消失会变占位',
      fix: '确认该实例的源组件可访问，或在库文件里手工替换'
    });
  }

  if (adopted.length > 0) {
    gaps.push({
      what: `收编 ${adopted.length} 个零件（其中 ${sets.length} 个变体集）`,
      impact: '零件成为本库自有组件，与源模板脱钩',
      fix: '无'
    });
  }

  if (skipped.length > 0) {
    gaps.push({
      what: `跳过 ${skipped.length} 个大尺寸实例（视为项目原稿内容，如截图）：${skipped
        .slice(0, 3)
        .map((s) => `${s.name} ${s.width}×${s.height}`)
        .join('、')}${skipped.length > 3 ? '…' : ''}`,
      impact: '这些位置仍引用外部组件；渲染时图区会整体替换，不受影响',
      fix: '无需处理；若确实需要保留，调高 contentSize 阈值'
    });
  }

  return { adopted, sets, gaps, unresolved, mapping, skipped };
}

/**
 * 收编后自检用：有没有留下指向外部的引用。
 * `adoptInstances` 返回的 `unresolved` 即"没处理掉的"，非空就不算通。
 */
export function isFullyAdopted(outcome: AdoptOutcome): boolean {
  return outcome.unresolved.length === 0;
}
