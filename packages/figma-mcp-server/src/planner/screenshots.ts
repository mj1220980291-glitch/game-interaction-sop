/**
 * Screenshot count alignment strategy.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/layout-planner/spec.md
 *
 * Rules (warnings emitted, plan still produced):
 *   - screenshots == sections : 1-to-1 mapping
 *   - screenshots <  sections : trailing sections get a placeholder
 *   - screenshots >  sections : truncate, surface SCREENSHOT_MORE_THAN_SECTIONS
 */

export interface AlignedSlot {
  sectionIndex: number;
  src: string | null; // null → placeholder
  alt: string;
}

export interface AlignmentResult {
  slots: AlignedSlot[];
  warnings: AlignmentWarning[];
}

export interface AlignmentWarning {
  code:
    | 'SCREENSHOT_FEWER_THAN_SECTIONS'
    | 'SCREENSHOT_MORE_THAN_SECTIONS';
  message: string;
}

interface ScreenshotInput {
  sectionIndex: number;
  src: string;
  alt: string;
}

interface SectionInput {
  index: number;
}

export function alignScreenshots(
  sections: SectionInput[],
  screenshots: ScreenshotInput[]
): AlignmentResult {
  const warnings: AlignmentWarning[] = [];
  const byIdx = new Map<number, ScreenshotInput>();
  for (const sh of screenshots) {
    if (!byIdx.has(sh.sectionIndex)) byIdx.set(sh.sectionIndex, sh);
  }

  const slots: AlignedSlot[] = sections.map((s) => {
    const sh = byIdx.get(s.index);
    return sh
      ? { sectionIndex: s.index, src: sh.src, alt: sh.alt }
      : { sectionIndex: s.index, src: null, alt: '' };
  });

  const placeholders = slots.filter((s) => s.src === null).length;
  const sectionIndexes = new Set(sections.map((s) => s.index));
  const orphanShots = screenshots.filter((sh) => !sectionIndexes.has(sh.sectionIndex)).length;

  if (placeholders > 0) {
    warnings.push({
      code: 'SCREENSHOT_FEWER_THAN_SECTIONS',
      message: `${placeholders} 个章节缺少配图，使用占位模板`
    });
  }
  if (orphanShots > 0) {
    warnings.push({
      code: 'SCREENSHOT_MORE_THAN_SECTIONS',
      message: `${orphanShots} 张配图找不到对应章节，已截断`
    });
  }

  return { slots, warnings };
}
