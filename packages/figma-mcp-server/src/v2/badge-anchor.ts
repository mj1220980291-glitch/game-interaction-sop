/**
 * 标号锚点 — 把「第 N 个簇的标号该指到图上哪个位置」从模板网格里解耦出来。
 *
 * 历史行为：标号位置只由簇序号决定（`geometry.bubbleGrid` / `DEFAULT_BUBBLE_GRID`），
 * 于是每章标号永远排成模板作者留下的一条斜线，与图上真实控件无关。
 *
 * 两种写法（可混用）：
 *
 *   1. 坐标锚点 — 主图归一化坐标（0–1），主图不是 1920×1080 也成立；
 *   2. 文本锚点 — 按**主图内控件的文本**定位，坐标由引擎在摆放时读画布算出来。
 *      这是唯一不用人工量坐标的写法，也是实例替换主图后仍然成立的写法。
 *
 * 键与 `assetMap` 同构：`"NN/C"` = 第 NN 章第 C 个簇（都从 1 起）。
 * 缺省不存在时行为与改动前完全一致（退回网格），因此对老调用方零影响。
 */

import { SOFT_WARNING_CODES, type SoftWarning } from './ir.js';

/** 坐标锚点：主图归一化坐标。 */
export interface CoordBadgeAnchor {
  /** 主图内横向比例，0 = 左边缘，1 = 右边缘。 */
  x: number;
  /** 主图内纵向比例，0 = 上边缘，1 = 下边缘。 */
  y: number;
  /** 给设计/策划看的一句话指向说明，引擎不使用。 */
  note?: string;
}

/**
 * 文本锚点：按主图内某个 TEXT 节点的文字定位。
 *
 * 引擎在摆放标号时扫描主图子树，取第一个字符完全一致（空白折叠、大小写
 * 不敏感）的 TEXT，把标号左上角放在它左上角 + `offset` 处。
 * 主图是 `figma_instance` 时控件文字随实例一起进来，因此**替换主图后不需要
 * 重算坐标**——这正是坐标锚点做不到的。
 */
export interface TextBadgeAnchor {
  /** 主图内控件的文本，例如 `"Click to input"`。 */
  text: string;
  /**
   * 相对命中文本节点左上角的像素偏移。默认 `[0, 0]`。
   * 例：`[-24, -24]` 把标号贴到控件左上外侧。
   */
  offset?: [number, number];
  /** 同名文本出现多次时取第几个（1 起）。缺省取第 1 个并告警。 */
  occurrence?: number;
  /** 给设计/策划看的一句话指向说明，引擎不使用。 */
  note?: string;
}

export type BadgeAnchor = CoordBadgeAnchor | TextBadgeAnchor;

export type BadgeAnchorMap = Record<string, BadgeAnchor>;

export function anchorKey(sectionIndex: string, clusterNo: number): string {
  return `${sectionIndex}/${clusterNo}`;
}

export function isTextAnchor(a: BadgeAnchor): a is TextBadgeAnchor {
  return typeof (a as TextBadgeAnchor).text === 'string';
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 一个锚点是否落在 0–1 之外（越界要夹取并告警）。文本锚点由引擎换算，不适用。 */
export function isOutOfRange(a: CoordBadgeAnchor): boolean {
  return a.x < 0 || a.x > 1 || a.y < 0 || a.y > 1;
}

export function clampAnchor(a: CoordBadgeAnchor): { x: number; y: number } {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  return { x: clamp(a.x), y: clamp(a.y) };
}

/** 取一章里的全部锚点，下标与簇序号对齐；没有就是 `undefined`。 */
export function pickAnchors(
  map: BadgeAnchorMap | undefined,
  sectionIndex: string,
  clusterCount: number
): Array<BadgeAnchor | undefined> {
  const out: Array<BadgeAnchor | undefined> = [];
  for (let c = 1; c <= clusterCount; c += 1) out.push(map?.[anchorKey(sectionIndex, c)]);
  return out;
}

/**
 * 「簇数 > 0 但一个锚点都没传」的告警。
 *
 * 以前这是**完全静默**的：标号全落在模板网格上，与主图控件脱节，返回体里
 * `warnings: []`，调用方无从判断。M1/M2/M3 三轮都是这么被打回的。
 */
export function badgeDefaultsWarning(clusterCount: number): SoftWarning | undefined {
  if (clusterCount <= 0) return undefined;
  return {
    code: SOFT_WARNING_CODES.W_BADGE_ANCHOR_DEFAULTED,
    message:
      `本次未传 badgeAnchors，${clusterCount} 个标号全部按模板网格摆放（位置与主图控件无关）。` +
      '传 {"NN/C": {text:"控件文本", offset:[-24,-24]}} 让引擎按控件自动吸附，' +
      '或传 {x,y} 归一化坐标。'
  };
}

/**
 * 把调用方传进来的原始对象收敛成合法锚点表。
 *
 * 坐标锚点只接受数字坐标；文本锚点只接受非空 `text`。缺字段、非有限数的键
 * 直接丢弃（宁可退回网格，也不要把标号甩到图外）。
 * 返回 `undefined` 表示"这次没给锚点"，与空对象区分开：空对象说明调用方给了
 * 但内容全废，值得一条告警。
 */
export function parseBadgeAnchors(raw: unknown): BadgeAnchorMap | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: BadgeAnchorMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    if (typeof v['text'] === 'string' && v['text'].trim() !== '') {
      const anchor: TextBadgeAnchor = { text: v['text'].trim() };
      const offset = v['offset'];
      if (
        Array.isArray(offset) &&
        offset.length === 2 &&
        isFiniteNumber(offset[0]) &&
        isFiniteNumber(offset[1])
      ) {
        anchor.offset = [offset[0], offset[1]];
      }
      if (isFiniteNumber(v['occurrence']) && v['occurrence'] >= 1) {
        anchor.occurrence = Math.floor(v['occurrence']);
      }
      if (typeof v['note'] === 'string' && v['note'].length > 0) anchor.note = v['note'];
      out[key] = anchor;
      continue;
    }
    if (!isFiniteNumber(v['x']) || !isFiniteNumber(v['y'])) continue;
    const anchor: CoordBadgeAnchor = { x: v['x'], y: v['y'] };
    if (typeof v['note'] === 'string' && v['note'].length > 0) anchor.note = v['note'];
    out[key] = anchor;
  }
  return out;
}
