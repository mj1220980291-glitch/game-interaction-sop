/**
 * 模板包的「后果自检」。
 *
 * 判据刻意不建立在「字段齐不齐」上：不同项目的模板结构可以不一样，确实可能用不到
 * 某些观感字段（用户决策 2026-11-05）。所以这里只回答两个问题：
 *
 *   1. 这次有没有用默认观感？            → `W_PACK_GEOMETRY_DEFAULTED`
 *   2. 产物里的正文还读得清吗？          → `W_TEXT_CONTRAST_LOW`
 *
 * 两条都是软告警：不改结论、不阻断渲染。同一套判据同时给渲染期与
 * `audit_template_pack` 工具用，排查时看到的话术一致。
 *
 * Spec: openspec/changes/template-pack-baseline-and-audit（template-render）
 */

import type { FigmaBackend } from './figma-client.js';
import type { SoftWarning } from './ir.js';
import { SOFT_WARNING_CODES } from './ir.js';
import type { TemplatePack } from './template/schema.js';

/** WCAG 大字号档；低于它基本就是「看不清」。可用 `GISOP_CONTRAST_MIN` 覆盖。 */
export const DEFAULT_CONTRAST_MIN = 3;

export function contrastMinFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.GISOP_CONTRAST_MIN);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CONTRAST_MIN;
}

/**
 * 字段体检：只报「用了默认值」，不判错。
 *
 * 之所以不做必填校验：模板可能本来就没有深色底（浅色模板），也可能章节根本不需要
 * 外框（单列模板）。判错会误伤。
 */
export function auditPackFields(pack: TemplatePack | undefined): SoftWarning[] {
  if (!pack) return [];
  const missing: string[] = [];
  const impacts: string[] = [];

  const docBackground = pack.docBackground ?? pack.geometry?.docBackground;
  if (!docBackground) {
    missing.push('docBackground');
    impacts.push('文档底色用默认白');
  }
  if (!pack.geometry?.sectionShell || pack.geometry.sectionShell.length === 0) {
    missing.push('sectionShell');
    impacts.push('章节没有外框，模板的黑边与卡片底色会缺');
  }
  if (missing.length === 0) return [];

  return [
    {
      code: SOFT_WARNING_CODES.W_PACK_GEOMETRY_DEFAULTED,
      message:
        `模板包缺观感字段 ${missing.join(' / ')}（本次走默认值）：${impacts.join('；')}。` +
        '这不是错误——模板可以用不到；要恢复原稿观感，用 figma_compile_template 重新产出模板包。'
    }
  ];
}

export interface ContrastTarget {
  id: string;
  /** 章节名，用于告警文案；缺省时用 id。 */
  name?: string;
}

/**
 * 正文对比度体检。
 *
 * 真正的祖先链遍历在插件侧做（`auditTextContrast`，一次往返），这里只负责把结果
 * 折成软告警。后端没有该能力、或体检本身失败时，一律**静默跳过**——自检不能
 * 变成新的故障源。
 */
export async function auditRenderedContrast(
  backend: FigmaBackend,
  targets: ContrastTarget[],
  opts: { minRatio?: number; log?: (m: string) => void } = {}
): Promise<SoftWarning[]> {
  const log = opts.log ?? (() => {});
  if (!backend.auditTextContrast || targets.length === 0) return [];
  const minRatio = opts.minRatio ?? contrastMinFromEnv();

  let rows: Awaited<ReturnType<NonNullable<FigmaBackend['auditTextContrast']>>>;
  try {
    rows = await backend.auditTextContrast({
      rootIds: targets.map((t) => t.id),
      minRatio
    });
  } catch (err) {
    log(`contrast audit skipped: ${(err as Error).message}`);
    return [];
  }

  const byId = new Map(targets.map((t) => [t.id, t]));
  const warnings: SoftWarning[] = [];
  for (const row of rows ?? []) {
    if (!row || (row.lowContrast ?? 0) === 0) continue;
    const name = byId.get(row.rootId)?.name ?? row.rootName ?? row.rootId;
    const sample = row.samples?.[0];
    warnings.push({
      code: SOFT_WARNING_CODES.W_TEXT_CONTRAST_LOW,
      message:
        `「${name}」有 ${row.lowContrast} 条正文对比度低于 ${minRatio}:1` +
        (sample
          ? `（文字 ${sample.textFill} / 背景 ${sample.bgFill}，实际 ${sample.ratio.toFixed(2)}:1）`
          : '') +
        '。先确认模板包有没有漏 geometry（docBackground / sectionShell），再看模板本身是否就是低对比设计。',
      context: name
    });
  }
  return warnings;
}

/** 工具入口：字段体检 + （可选）渲染后对比度体检的组合。 */
export async function auditTemplatePack(input: {
  pack?: TemplatePack;
  backend?: FigmaBackend;
  chapterIds?: string[];
}): Promise<{ warnings: SoftWarning[] }> {
  const warnings = auditPackFields(input.pack);
  if (input.backend && input.chapterIds && input.chapterIds.length > 0) {
    warnings.push(
      ...(await auditRenderedContrast(
        input.backend,
        input.chapterIds.map((id) => ({ id }))
      ))
    );
  }
  return { warnings };
}
