/**
 * 编译期字体归一化 — 所有落进库组件的文本统一成 `Noto Sans SC`。
 *
 * 为什么不是"沿用项目字体"：项目字体（`U5Font` 等）不装就静默回退字重，
 * 而这个回退会被永久烙进库组件，之后所有文档都错，且结构指纹不含字体、
 * 检测不到。统一成一个我们确定可加载的字体族，是唯一能自证的做法。
 *
 * 代价（已知并接受）：交付文档字体统一，项目原字体不再出现。
 *
 * Spec: openspec/changes/template-compile-to-library (D7)
 */

/** 归一化目标字体族。 */
export const COMPILE_FONT_FAMILY = 'Noto Sans SC';

/** 本环境实测可用字重（2026-10-26 真机 `listAvailableFontsAsync`）。 */
export const COMPILE_FONT_STYLES = ['Regular', 'Medium', 'Bold'] as const;

export type CompileFontStyle = (typeof COMPILE_FONT_STYLES)[number];

/** 原字重 → 目标字重。键为小写去分隔符的形式。 */
const WEIGHT_MAP: Record<string, CompileFontStyle> = {
  thin: 'Regular',
  extralight: 'Regular',
  ultralight: 'Regular',
  light: 'Regular',
  book: 'Regular',
  regular: 'Regular',
  normal: 'Regular',
  medium: 'Medium',
  semibold: 'Medium',
  demibold: 'Medium',
  bold: 'Bold',
  extrabold: 'Bold',
  black: 'Bold',
  heavy: 'Bold'
};

function normalizeKey(style: string): string {
  return style.trim().toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * `mapped: true` 表示原字重名在目标字体里有同名档位（视觉一致）；
 * `false` 表示做了就近映射或落到 `Regular`，调用方应记一条 gap。
 */
export function mapFontStyle(from: string): { style: CompileFontStyle; mapped: boolean } {
  const key = normalizeKey(from);
  const hit = WEIGHT_MAP[key];
  if (!hit) return { style: 'Regular', mapped: false };
  return { style: hit, mapped: key === hit.toLowerCase() };
}

/** 传给后端脚本的映射表（键已归一化）。 */
export function buildWeightMap(): Record<string, CompileFontStyle> {
  return { ...WEIGHT_MAP };
}
