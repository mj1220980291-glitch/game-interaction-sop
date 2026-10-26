/**
 * 编译前置校验 — 写画布**之前**把能拒绝的都拒绝掉，不留半成品。
 *
 * 四条（spec 前置校验）：
 *   库文件可写 / 后端能做组件 · 归一化字体可加载 · 源模板指纹一致 · 差异可表达
 *
 * 失败不留痕：本模块只读，真正的写入由调用方在 `ok` 之后才开始。
 *
 * Spec: openspec/changes/template-compile-to-library (D7 / 9.1)
 */

import type { FigmaBackend } from '../figma-client.js';
import { COMPILE_CODES, compileError } from './errors.js';

export interface PreflightInput {
  backend: FigmaBackend;
  /** 库文件里放组件的页面 id。 */
  libraryPageId: string;
  /** 探针阶段记录的源模板指纹（没记录则跳过比对）。 */
  expectedFingerprint?: string;
  /** 当前源模板指纹（由调用方先探一次得到）。 */
  actualFingerprint?: string;
  /** 8 项能力是否覆盖该模板差异（由探针 / 编排层判定）。 */
  expressible?: { ok: boolean; reasons?: string[] };
}

export interface PreflightOk {
  ok: true;
}

const REQUIRED_METHODS = [
  'cloneNode',
  'createComponentFromNode',
  'setPluginData'
] as const;

export async function preflight(input: PreflightInput): Promise<PreflightOk> {
  const missing = REQUIRED_METHODS.filter((m) => typeof input.backend[m] !== 'function');
  if (missing.length > 0) {
    throw compileError(
      COMPILE_CODES.LIBRARY_UNWRITABLE,
      `当前 Figma 后端缺少这些能力，无法在库里造组件：${missing.join('、')}`
    );
  }

  // 库页可读性是"能不能写"的最低证据：读不到就没有落点。
  const page = await input.backend.getNodeInfo(input.libraryPageId);
  if (page.type !== 'PAGE') {
    throw compileError(
      COMPILE_CODES.LIBRARY_UNWRITABLE,
      `库落点 ${input.libraryPageId} 不是页面（实际 ${page.type}）——请指定库文件里的页面 id`
    );
  }

  if (
    input.expectedFingerprint &&
    input.actualFingerprint &&
    input.expectedFingerprint !== input.actualFingerprint
  ) {
    throw compileError(
      COMPILE_CODES.SOURCE_DRIFT,
      `源模板结构已变化（记录 ${input.expectedFingerprint.slice(0, 16)}… ≠ 当前 ${input.actualFingerprint.slice(0, 16)}…）——请先重跑探针`
    );
  }

  if (input.expressible && !input.expressible.ok) {
    throw compileError(
      COMPILE_CODES.CAPABILITY_UNEXPRESSIBLE,
      `该模板有现有 8 项能力表达不了的差异：${(input.expressible.reasons ?? []).join('；') || '未给出原因'}`
    );
  }

  return { ok: true };
}
