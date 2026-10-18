/**
 * 状态行识别 — parser / render / reconcile 共用的唯一实现。
 *
 * Spec: markdown-v2-contract「状态行语法」
 *
 * 输入为 normalizeBulletText 之后的 bullet 文字（不含 `- ` 前缀）。
 */

export interface StateLine {
  /** 状态名，如 `冷却状态` */
  name: string;
  /** 状态名在原文中的结束位置（不含冒号），即加粗范围 [0, nameEnd) */
  nameEnd: number;
}

const HEAD_MIN = 3;
const HEAD_MAX = 10;
const HEAD_PUNCT_RE = /[，,。；;、！!？?]/;
const NON_STATE_PREFIX_RE = /^(配图|动效需求)/;
const LEGACY_PREFIX_RE = /^状态\s*[·｜|]/;

export function parseStateLine(text: string): StateLine | null {
  if (NON_STATE_PREFIX_RE.test(text)) return null;
  const colon = text.search(/[：:]/);
  const rawHead = colon >= 0 ? text.slice(0, colon) : text;
  const head = rawHead.trimEnd();
  const len = [...head].length;
  if (len < HEAD_MIN || len > HEAD_MAX) return null;
  if (!head.endsWith('状态')) return null;
  if (HEAD_PUNCT_RE.test(head)) return null;
  return { name: head, nameEnd: head.length };
}

/** 加粗字符数：状态行为状态名长度，否则 0。 */
export function stateBoldLength(text: string): number {
  return parseStateLine(text)?.nameEnd ?? 0;
}

export function isLegacyStatePrefix(text: string): boolean {
  return LEGACY_PREFIX_RE.test(text);
}
