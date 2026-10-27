/**
 * 编译期错误码与缺口类型。
 *
 * Spec: openspec/changes/template-compile-to-library/specs/template-compile/spec.md
 */

export const COMPILE_CODES = {
  /** 库文件不可写 / 拿不到创建组件的权限 */
  LIBRARY_UNWRITABLE: 'V2_COMPILE_LIBRARY_UNWRITABLE',
  /** 归一化字体（Noto Sans SC 某档字重）加载不了 */
  FONT_UNAVAILABLE: 'V2_COMPILE_FONT_UNAVAILABLE',
  /** 源模板结构与探针记录不一致 */
  SOURCE_DRIFT: 'V2_COMPILE_SOURCE_DRIFT',
  /** 差异无法用现有 8 项能力表达 */
  CAPABILITY_UNEXPRESSIBLE: 'V2_COMPILE_CAPABILITY_UNEXPRESSIBLE',
  /** 部件未发布（跨文件 import 冒烟失败） */
  NOT_PUBLISHED: 'V2_COMPILE_NOT_PUBLISHED',
  /** 冒烟跑不了（目标文件没连上插件 / 传输失败），与「未发布」是两回事 */
  VERIFY_UNAVAILABLE: 'V2_COMPILE_VERIFY_UNAVAILABLE',
  /** `_staging` 页上缺部件 */
  STAGED_PART_MISSING: 'V2_COMPILE_STAGED_PART_MISSING',
  /** 名字以 `_` / `.` 开头 → Figma 判定不发布 */
  UNPUBLISHABLE_NAME: 'V2_COMPILE_UNPUBLISHABLE_NAME',
  /** 后端缺少本变更要求的可选方法 */
  BACKEND_UNSUPPORTED: 'V2_COMPILE_BACKEND_UNSUPPORTED'
} as const;

export type CompileCode = (typeof COMPILE_CODES)[keyof typeof COMPILE_CODES];

export function compileError(code: CompileCode, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** 一条「记下来但不中止」的缺口。字形与探针的 gaps 一致。 */
export interface CompileGap {
  what: string;
  impact: string;
  fix: string;
}
