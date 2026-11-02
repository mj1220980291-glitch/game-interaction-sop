/**
 * 标号锚点 — 把「第 N 个簇的标号该指到图上哪个位置」从模板网格里解耦出来。
 *
 * 历史行为：标号位置只由簇序号决定（`geometry.bubbleGrid` / `DEFAULT_BUBBLE_GRID`），
 * 于是每章标号永远排成模板作者留下的一条斜线，与图上真实控件无关。
 *
 * 锚点用**主图归一化坐标（0–1）**表达，主图不是 1920×1080 也成立；
 * 键与 `assetMap` 同构：`"NN/C"` = 第 NN 章第 C 个簇（都从 1 起）。
 * 缺省不存在时行为与改动前完全一致（退回网格），因此对老调用方零影响。
 */

export interface BadgeAnchor {
  /** 主图内横向比例，0 = 左边缘，1 = 右边缘。 */
  x: number;
  /** 主图内纵向比例，0 = 上边缘，1 = 下边缘。 */
  y: number;
  /** 给设计/策划看的一句话指向说明，引擎不使用。 */
  note?: string;
}

export type BadgeAnchorMap = Record<string, BadgeAnchor>;

export function anchorKey(sectionIndex: string, clusterNo: number): string {
  return `${sectionIndex}/${clusterNo}`;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 一个锚点是否落在 0–1 之外（越界要夹取并告警）。 */
export function isOutOfRange(a: BadgeAnchor): boolean {
  return a.x < 0 || a.x > 1 || a.y < 0 || a.y > 1;
}

export function clampAnchor(a: BadgeAnchor): { x: number; y: number } {
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
 * 把调用方传进来的原始对象收敛成合法锚点表。
 *
 * 只接受数字坐标；缺 x / y、非有限数的键直接丢弃（宁可退回网格，也不要把标号
 * 甩到图外）。返回 `undefined` 表示"这次没给锚点"，与空对象区分开：空对象说明
 * 调用方给了但内容全废，值得一条告警。
 */
export function parseBadgeAnchors(raw: unknown): BadgeAnchorMap | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: BadgeAnchorMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    if (!isFiniteNumber(v['x']) || !isFiniteNumber(v['y'])) continue;
    const anchor: BadgeAnchor = { x: v['x'], y: v['y'] };
    if (typeof v['note'] === 'string' && v['note'].length > 0) anchor.note = v['note'];
    out[key] = anchor;
  }
  return out;
}
