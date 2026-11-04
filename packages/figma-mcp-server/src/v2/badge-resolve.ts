/**
 * 文本锚点的运行时解析：把 `{ text, offset }` 变成主图归一化坐标。
 *
 * 为什么必须在渲染期算：主图常常是 `figma_instance`（真实实例），
 * 控件位置由实例自身的布局决定；设计师换一版主图，坐标就全变了。
 * 按控件文本定位则与坐标无关，换图后重新读一遍画布即可。
 *
 * 归一化基准是**主图的实际矩形**（absoluteBoundingBox），不是模板网格。
 * 这也意味着：实例替换主图后必须重跑本步骤——渲染流程里它就是排在
 * `applyAsset` 之后、摆放标号之前。
 */

import type { FigmaBackend, NodeInfo } from './figma-client.js';
import type { SoftWarning } from './ir.js';
import { SOFT_WARNING_CODES } from './ir.js';
import { isTextAnchor, type BadgeAnchor, type CoordBadgeAnchor } from './badge-anchor.js';

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 文本比较口径：空白折叠 + 大小写不敏感。Figma 里换行/多空格很常见。 */
function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface ResolveTextAnchorsInput {
  backend: FigmaBackend;
  /** 扫描起点：优先主图节点，主图缺失时用章节节点。 */
  searchRootId: string;
  /** 主图绝对矩形。归一化坐标以此为基准。 */
  rect: ImageRect;
  /** 与簇序号对齐的锚点表。 */
  anchors: Array<BadgeAnchor | undefined>;
  sectionIndex: string;
  warnings: SoftWarning[];
}

/**
 * 把文本锚点换成坐标锚点；坐标锚点原样返回。
 *
 * 找不到文本时**退回网格**（返回 `undefined`）并报
 * `V2_W_BADGE_ANCHOR_TEXT_NOT_FOUND`——宁可标号位置示意，也不要静默放到
 * 图上某个角落。
 */
export async function resolveTextAnchors(
  input: ResolveTextAnchorsInput
): Promise<Array<CoordBadgeAnchor | undefined>> {
  const { anchors, rect, sectionIndex, warnings } = input;
  const textAnchors = anchors.filter((a): a is Extract<BadgeAnchor, { text: string }> =>
    a !== undefined && isTextAnchor(a)
  );
  if (textAnchors.length === 0) {
    return anchors.map((a) => (a !== undefined && !isTextAnchor(a) ? a : undefined));
  }

  let texts: Array<{ id: string; text: string; node: NodeInfo }> = [];
  let failed: string | undefined;
  try {
    const { nodes } = await input.backend.scanSubtree(input.searchRootId, 20000);
    texts = nodes
      .filter((n) => n.type === 'TEXT' && typeof n.characters === 'string' && n.characters.trim() !== '')
      .map((n) => ({ id: n.id, text: n.characters as string, node: n }));
  } catch (e) {
    failed = (e as Error).message;
  }

  const out: Array<CoordBadgeAnchor | undefined> = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    const context = `${sectionIndex}/${i + 1}`;
    if (!anchor) {
      out.push(undefined);
      continue;
    }
    if (!isTextAnchor(anchor)) {
      out.push(anchor);
      continue;
    }
    if (failed !== undefined) {
      warnings.push({
        code: SOFT_WARNING_CODES.W_BADGE_ANCHOR_TEXT_NOT_FOUND,
        message: `第 ${sectionIndex} 章第 ${i + 1} 个簇：文本锚点「${anchor.text}」无法解析（读取主图失败：${failed}），标号按模板网格放置`,
        context
      });
      out.push(undefined);
      continue;
    }
    const want = normalizeText(anchor.text);
    const hits = texts.filter((n) => normalizeText(n.text) === want);
    const occurrence = anchor.occurrence ?? 1;
    const hit = hits[occurrence - 1];
    if (!hit) {
      warnings.push({
        code: SOFT_WARNING_CODES.W_BADGE_ANCHOR_TEXT_NOT_FOUND,
        message:
          `第 ${sectionIndex} 章第 ${i + 1} 个簇：主图里找不到文本「${anchor.text}」` +
          `（命中 ${hits.length} 个，需要第 ${occurrence} 个），标号按模板网格放置。` +
          '主图是位图时没有可匹配的 TEXT——请改用 {x,y} 坐标锚点，或用 figma_instance 放真实实例。',
        context
      });
      out.push(undefined);
      continue;
    }
    if (hits.length > 1 && anchor.occurrence === undefined) {
      warnings.push({
        code: SOFT_WARNING_CODES.W_BADGE_ANCHOR_TEXT_AMBIGUOUS,
        message:
          `第 ${sectionIndex} 章第 ${i + 1} 个簇：文本「${anchor.text}」命中 ${hits.length} 个控件，` +
          `已取第 1 个（${hit.id}）；要别的就加 occurrence`,
        context
      });
    }
    const box = hit.node.absoluteBoundingBox;
    if (!box) {
      warnings.push({
        code: SOFT_WARNING_CODES.W_BADGE_ANCHOR_TEXT_NOT_FOUND,
        message: `第 ${sectionIndex} 章第 ${i + 1} 个簇：命中的控件 ${hit.id} 没有 absoluteBoundingBox，标号按模板网格放置`,
        context
      });
      out.push(undefined);
      continue;
    }
    if (rect.width <= 0 || rect.height <= 0) {
      warnings.push({
        code: SOFT_WARNING_CODES.W_BADGE_ANCHOR_TEXT_NOT_FOUND,
        message: `第 ${sectionIndex} 章：主图矩形为空（宽 ${rect.width} 高 ${rect.height}），文本锚点无法换算，标号按模板网格放置`,
        context
      });
      out.push(undefined);
      continue;
    }
    const [ox, oy] = anchor.offset ?? [0, 0];
    const resolved: CoordBadgeAnchor = {
      x: (box.x + ox - rect.x) / rect.width,
      y: (box.y + oy - rect.y) / rect.height
    };
    if (anchor.note) resolved.note = anchor.note;
    out.push(resolved);
  }
  return out;
}
