/**
 * 多部件文档的几何收尾：章节高度、左列贴合、标号摆放。
 *
 * 渲染和同步都要用：同步新增一个簇之后，章节高度与标号数量都得跟着变，
 * 否则画布上会出现"簇多了但标号还是两个、章节下方多出一截空白"。
 *
 * Spec: openspec/changes/parts-doc-reconcile-sync (D5)
 */

import type { FigmaBackend, NodeInfo } from '../../figma-client.js';
import type { SoftWarning } from '../../ir.js';
import { SOFT_WARNING_CODES } from '../../ir.js';
import { MAIN_IMAGE_SIZE } from '../../template-map.js';
import {
  BADGE_MASTER_NAME,
  CHAPTER_SLOTS,
  isBadgeFrame,
  isBadgeMaster
} from '../../template-slots.js';
import { bubbleOffset } from '../../render.js';

export const PARTS_GEOMETRY_CODES = {
  BADGE_MASTER_MISSING: 'V2_RENDER_BADGE_MASTER_MISSING'
} as const;

function fail(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** 章节高度贴合内容；自动布局的章节高度是算出来的，跳过。 */
export async function fitChapterHeight(backend: FigmaBackend, chapterId: string): Promise<void> {
  if (typeof backend.resizeNode !== 'function') return;
  const info = await backend.getNodeInfo(chapterId);
  if (info.layoutMode === 'HORIZONTAL' || info.layoutMode === 'VERTICAL') return;
  const top = info.absoluteBoundingBox?.y ?? 0;
  let bottom = 0;
  for (const childId of info.childIds ?? []) {
    const child = await backend.getNodeInfo(childId);
    const box = child.absoluteBoundingBox;
    if (!box) continue;
    bottom = Math.max(bottom, box.y + box.height);
  }
  const height = Math.max(bottom - top, 1);
  if (Math.abs(height - (info.absoluteBoundingBox?.height ?? 0)) > 1) {
    await backend.resizeNode(chapterId, info.absoluteBoundingBox?.width ?? 2209, height);
  }
}

/**
 * 左列（标题 + 舞台）高度是模板写死的，说明栏随文案变长后两列底边不齐。
 * 章节是自动布局时不能动父级，但拉伸子级没问题（HUG 会被 resize 改成 FIXED）。
 */
export async function stretchLeftColumn(backend: FigmaBackend, chapterId: string): Promise<void> {
  if (typeof backend.resizeNode !== 'function') return;
  const info = await backend.getNodeInfo(chapterId);
  let taller = 0;
  let left: NodeInfo | undefined;
  for (const childId of info.childIds ?? []) {
    const child = await backend.getNodeInfo(childId);
    const box = child.absoluteBoundingBox;
    if (!box) continue;
    if (child.name === CHAPTER_SLOTS.leftColumn) left = child;
    else taller = Math.max(taller, box.height);
  }
  const box = left?.absoluteBoundingBox;
  if (!left || !box || taller <= box.height + 1) return;
  await backend.resizeNode(left.id, box.width, taller);
}

/** 章节的两条几何收尾，渲染与同步共用。 */
export async function refreshChapterGeometry(
  backend: FigmaBackend,
  chapterId: string
): Promise<void> {
  await fitChapterHeight(backend, chapterId);
  await stretchLeftColumn(backend, chapterId);
}

async function findNamed(
  backend: FigmaBackend,
  rootId: string,
  name: string
): Promise<string | undefined> {
  const { nodes } = await backend.scanSubtree(rootId, 20000);
  return nodes.find((n) => n.name === name)?.id;
}

/**
 * 按簇数重摆标号：只留母版，其余按网格克隆。
 *
 * `known` 是已经存在的标号（同步时来自画布），数量不够才克隆新的；
 * 多出来的删掉。设计师手工挪过的坐标不重写——只改数量与编号。
 */
export async function placeBadges(
  backend: FigmaBackend,
  chapterId: string,
  clusterCount: number,
  chapterIndex: string,
  warnings: SoftWarning[],
  badges: 'container' | 'manual' | 'none',
  known: NodeInfo[] = []
): Promise<NodeInfo[]> {
  if (clusterCount === 0) return [];
  if (badges !== 'container') {
    warnings.push({
      code: SOFT_WARNING_CODES.W_BADGE_UNPLACED,
      message: `第 ${chapterIndex} 章：模板不支持图上标号（badgeSlot = ${badges}），标号未摆放`
    });
    return [];
  }

  const containerId = await findNamed(backend, chapterId, CHAPTER_SLOTS.badgeContainer);
  if (!containerId) {
    throw fail(
      PARTS_GEOMETRY_CODES.BADGE_MASTER_MISSING,
      `第 ${chapterIndex} 章：找不到标号容器「${CHAPTER_SLOTS.badgeContainer}」——重编该项目的模板`
    );
  }
  const container = await backend.getNodeInfo(containerId);
  const children = container.childIds ? await backend.getNodesInfo(container.childIds) : [];
  const master =
    children.find((c) => isBadgeMaster(c.name)) ?? children.find((c) => isBadgeFrame(c.name));
  if (!master) {
    throw fail(
      PARTS_GEOMETRY_CODES.BADGE_MASTER_MISSING,
      `第 ${chapterIndex} 章：标号容器里没有母版「${BADGE_MASTER_NAME}」——重编该项目的模板`
    );
  }

  // 标号要贴在主图上，而主图不一定是 1920×1080（蛋仔 1200×745）。
  // 网格本身仍按 1920×1080 的目标位置定义，这里换算到主图的实际矩形。
  const rect = await imageRectInContainer(backend, chapterId, container);

  // 气泡自己也得跟主图一样大：留着 1920×1080 会盖住说明栏。
  if (backend.resizeNode && (container.layoutMode ?? 'NONE') === 'NONE') {
    const needsResize =
      Math.abs((container.absoluteBoundingBox?.width ?? 0) - rect.width) > 1 ||
      Math.abs((container.absoluteBoundingBox?.height ?? 0) - rect.height) > 1;
    if (needsResize) await backend.resizeNode(containerId, rect.width, rect.height);
  }

  const existing = known.length > 0 ? known : [];
  const stale = children
    .filter((c) => isBadgeFrame(c.name) && c.id !== master.id && !existing.some((e) => e.id === c.id))
    .map((c) => c.id);
  if (stale.length > 0) await backend.deleteNodes(stale);
  if (master.visible !== false && backend.setNodeVisible) {
    await backend.setNodeVisible(master.id, false);
  }

  const out: NodeInfo[] = [];
  for (let i = 0; i < clusterCount; i += 1) {
    const already = existing[i];
    const bubble =
      already ??
      (await (async () => {
        const created = await backend.cloneNode({ sourceId: master.id, parentId: containerId });
        if (backend.renameNode) await backend.renameNode(created.id, `标号/${i + 1}`);
        const at = badgePosition(i, rect, master);
        await backend.moveNode(created.id, at.x, at.y);
        if (backend.setNodeVisible) await backend.setNodeVisible(created.id, true);
        return created;
      })());
    await setBadgeNumber(backend, bubble.id, i + 1);
    out.push(bubble);
  }
  // 多出来的标号（簇变少）删掉。
  const surplus = existing.slice(clusterCount).map((b) => b.id);
  if (surplus.length > 0) await backend.deleteNodes(surplus);
  return out;
}

/**
 * 同步后重排标号：只重摆本次新增的那几个。
 *
 * `keepCount` 是同步前的簇数——它的标号位置是设计师的和渲染期的，不能动；
 * 之后的按网格克隆。scratch 搬过来的标号带的是临时文档的坐标，不能留。
 */
export async function relayoutBadges(
  backend: FigmaBackend,
  chapterId: string,
  chapterIndex: string,
  clusterCount: number,
  keepCount: number,
  badges: 'container' | 'manual' | 'none',
  warnings: SoftWarning[]
): Promise<void> {
  if (badges !== 'container') return;
  const containerId = await findNamed(backend, chapterId, CHAPTER_SLOTS.badgeContainer);
  if (!containerId) return;
  const container = await backend.getNodeInfo(containerId);
  const children = container.childIds ? await backend.getNodesInfo(container.childIds) : [];
  const ordered = children
    .filter((c) => isBadgeFrame(c.name) && !isBadgeMaster(c.name))
    .sort((a, b) => badgeOrdinal(a.name) - badgeOrdinal(b.name));
  const kept = ordered.filter((b) => badgeOrdinal(b.name) <= keepCount).slice(0, clusterCount);
  await placeBadges(backend, chapterId, clusterCount, chapterIndex, warnings, badges, kept);
}

function badgeOrdinal(name: string): number {
  const m = /(\d+)\s*$/.exec(name);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

async function imageRectInContainer(
  backend: FigmaBackend,
  chapterId: string,
  container: NodeInfo
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = container.absoluteBoundingBox;
  const fallback = { x: 0, y: 0, width: MAIN_IMAGE_SIZE.width, height: MAIN_IMAGE_SIZE.height };
  if (!box) return fallback;
  const imageId = await findNamed(backend, chapterId, CHAPTER_SLOTS.mainImage);
  if (!imageId) return fallback;
  const image = await backend.getNodeInfo(imageId);
  const img = image.absoluteBoundingBox;
  if (!img) return fallback;
  return { x: img.x - box.x, y: img.y - box.y, width: img.width, height: img.height };
}

/**
 * 第 i 个标号落在主图矩形里的位置。
 *
 * `bubbleOffset` 的网格是按 1920×1080 的主图定义的；这里按主图实际宽高等比
 * 缩放，并夹在矩形内，避免标号跑到图外（蛋仔的主图只有 1200×745）。
 */
function badgePosition(
  index: number,
  rect: { x: number; y: number; width: number; height: number },
  master: NodeInfo
): { x: number; y: number } {
  const base = bubbleOffset(index);
  const w = master.absoluteBoundingBox?.width ?? 48;
  const h = master.absoluteBoundingBox?.height ?? 48;
  const x = rect.x + (base.x / MAIN_IMAGE_SIZE.width) * rect.width;
  const y = rect.y + (base.y / MAIN_IMAGE_SIZE.height) * rect.height;
  return {
    x: Math.round(Math.min(Math.max(x, rect.x), rect.x + rect.width - w)),
    y: Math.round(Math.min(Math.max(y, rect.y), rect.y + rect.height - h))
  };
}

async function setBadgeNumber(
  backend: FigmaBackend,
  bubbleId: string,
  value: number
): Promise<void> {
  const info = await backend.getNodeInfo(bubbleId);
  if (!info.childIds || info.childIds.length === 0) return;
  const children = await backend.getNodesInfo(info.childIds);
  const text =
    children.find((c) => c.type === 'TEXT' && c.name === '#Number') ??
    children.find((c) => c.type === 'TEXT');
  if (text) await backend.setTextContent(text.id, String(value));
}
