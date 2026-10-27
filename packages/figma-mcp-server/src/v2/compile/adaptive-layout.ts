/**
 * 自适应外壳 —— 给部件根接上 HUG 链，让内容变多时高度自己长。
 *
 * 项目模板里本来就有这条链（蛋仔 `Frame 76` VERTICAL HUG + 章节 GROUP 包边），
 * 是造壳拆平子级时断掉的：根框变成一个固定高，内容长短它都不动，渲染只能事后
 * 量一遍子级再 `resizeNode` 压高度。那个补丁每次都可能压歪，且对多行文本无效。
 *
 * 这里把「子级现在的位置」翻译成自动布局参数，几何一行不动：
 *
 *   paddingTop  = min(说明栏.y, 主图.y) - 根.y
 *   itemSpacing = 说明栏.x - 主图右边
 *   其余直接子级（气泡 / 标号舞台）→ 绝对定位，完全脱离排版
 *
 * 只让**高度** HUG。宽度跨模板不一致（2209 / 3382 / 3698），按内容猜宽度只会
 * 把版面重排一遍，收益为零。
 *
 * 幂等：已经是自动布局的部件直接跳过（官方1.14 的簇就是这样）。
 * 转不了就记缺口，不改半截——宁可渲染期继续用手工压高度兜着。
 *
 * Spec: openspec/changes/template-adaptive-shell (D1 / D2)
 */

import type { FigmaBackend, NodeInfo } from '../figma-client.js';
import { CHAPTER_SLOTS } from '../template-slots.js';
import type { CompileGap } from './errors.js';
import type { PartName } from './parts.js';

export interface AdaptiveInput {
  backend: FigmaBackend;
  parts: Array<{ part: PartName; nodeId: string }>;
}

export interface AdaptiveApplied {
  part: PartName;
  mode: 'HORIZONTAL' | 'VERTICAL';
  itemSpacing: number;
  paddingTop: number;
  absoluteChildren: string[];
}

export interface AdaptiveOutcome {
  applied: AdaptiveApplied[];
  gaps: CompileGap[];
  /** 没转成的部件与原因（人读，不重复进 gaps 的写法差异见 push）。 */
  skipped: Array<{ part: PartName; reason: string }>;
}

/** HUG 只保高度；宽度永远是模板自己的宽度。 */
const HUG_HEIGHT = true;

export async function applyAdaptiveLayout(input: AdaptiveInput): Promise<AdaptiveOutcome> {
  const out: AdaptiveOutcome = { applied: [], gaps: [], skipped: [] };
  if (!input.backend.setAutoLayout) {
    out.gaps.push({
      what: '后端不支持设置自动布局，部件的自适应外壳未生效',
      impact: '渲染期仍需手工压章节高度，内容超出时会被截断',
      fix: '升级 figma-console 后端后重编'
    });
    return out;
  }

  for (const item of input.parts) {
    if (item.part !== 'chapter' && item.part !== 'cluster') continue;
    const plan = await planFor(input.backend, item.part, item.nodeId);
    if (plan.kind === 'skip') {
      out.skipped.push({ part: item.part, reason: plan.reason });
      continue;
    }
    if (plan.kind === 'gap') {
      out.skipped.push({ part: item.part, reason: plan.gap.what });
      out.gaps.push(plan.gap);
      continue;
    }
    await input.backend.setAutoLayout({ nodeId: item.nodeId, ...plan.spec });
    out.applied.push({
      part: item.part,
      mode: plan.spec.mode,
      itemSpacing: plan.spec.itemSpacing,
      paddingTop: plan.spec.padding.top,
      absoluteChildren: plan.spec.absoluteChildIds
    });
  }

  return out;
}

type Plan =
  | { kind: 'skip'; reason: string }
  | { kind: 'gap'; gap: CompileGap }
  | {
      kind: 'apply';
      spec: {
        mode: 'HORIZONTAL' | 'VERTICAL';
        itemSpacing: number;
        padding: { top: number };
        hugHeight: boolean;
        absoluteChildIds: string[];
      };
    };

async function planFor(backend: FigmaBackend, part: PartName, rootId: string): Promise<Plan> {
  const root = await backend.getNodeInfo(rootId);
  if (root.layoutMode === 'HORIZONTAL' || root.layoutMode === 'VERTICAL') {
    return { kind: 'skip', reason: '已经是自动布局' };
  }
  const rootBox = root.absoluteBoundingBox;
  const childIds = root.childIds ?? [];
  if (!rootBox || childIds.length === 0) {
    return {
      kind: 'gap',
      gap: {
        what: `「${part}」部件读不到根框或子级，自适应外壳未加`,
        impact: '渲染期仍手工压高度',
        fix: '检查该部件是否为空壳'
      }
    };
  }

  const children = await backend.getNodesInfo(childIds);
  const byId = new Map(children.map((c) => [c.id, c]));

  if (part === 'cluster') return planCluster(rootBox, childIds, byId);
  return planChapter(rootBox, childIds, byId);
}

/**
 * 簇：根下面通常只有一个包边的 GROUP（蛋仔），把根设成纵向 HUG 就接上了链。
 * 官方1.14 的簇根本身就是 VERTICAL HUG，走不到这里。
 */
function planCluster(
  rootBox: NonNullable<NodeInfo['absoluteBoundingBox']>,
  childIds: string[],
  byId: Map<string, NodeInfo>
): Plan {
  if (childIds.length > 1) {
    return {
      kind: 'gap',
      gap: {
        what: `「簇」部件根有 ${childIds.length} 个直接子级，无法判断纵向顺序，自适应外壳未加`,
        impact: '簇高度不跟随内容，多行正文可能与下一簇重叠',
        fix: '重编时把簇根收成一个包边容器'
      }
    };
  }
  const only = byId.get(childIds[0]!);
  const box = only?.absoluteBoundingBox;
  if (!only || !box) {
    return { kind: 'skip', reason: '子级无包围盒' };
  }
  return {
    kind: 'apply',
    spec: {
      mode: 'VERTICAL',
      itemSpacing: 0,
      padding: { top: Math.round(box.y - rootBox.y) },
      hugHeight: HUG_HEIGHT,
      absoluteChildIds: []
    }
  };
}

/**
 * 章节：横向两栏（图区 / 说明栏），气泡这类舞台绝对定位叠在上面。
 *
 * 子级顺序必须是「图区在前、说明栏在后」——自动布局按子级顺序排，
 * 顺序反了会左右对调，那是猜，宁可记缺口。
 */
function planChapter(
  rootBox: NonNullable<NodeInfo['absoluteBoundingBox']>,
  childIds: string[],
  byId: Map<string, NodeInfo>
): Plan {
  const graphicId = childIds.find((id) => byId.get(id)?.name === CHAPTER_SLOTS.mainImage);
  const columnId = childIds.find((id) => byId.get(id)?.name === CHAPTER_SLOTS.clusterHost);

  // 单子级（官方1.14：一个包边 GROUP）——纵向 HUG 就够。
  if (childIds.length === 1 && !graphicId && !columnId) {
    const only = byId.get(childIds[0]!);
    const box = only?.absoluteBoundingBox;
    if (!only || !box) return { kind: 'skip', reason: '子级无包围盒' };
    return {
      kind: 'apply',
      spec: {
        mode: 'VERTICAL',
        itemSpacing: 0,
        padding: { top: Math.round(box.y - rootBox.y) },
        hugHeight: HUG_HEIGHT,
        absoluteChildIds: []
      }
    };
  }

  if (!graphicId || !columnId) {
    return {
      kind: 'gap',
      gap: {
        what: `「章节」部件找不到槽位「${!graphicId ? CHAPTER_SLOTS.mainImage : CHAPTER_SLOTS.clusterHost}」，自适应外壳未加`,
        impact: '章节高度固定，内容超出时会被截断',
        fix: '先修槽位归一化，再重编'
      }
    };
  }

  const graphic = byId.get(graphicId)!;
  const column = byId.get(columnId)!;
  const g = graphic.absoluteBoundingBox;
  const c = column.absoluteBoundingBox;
  if (!g || !c) return { kind: 'skip', reason: '槽位无包围盒' };

  if (childIds.indexOf(graphicId) > childIds.indexOf(columnId)) {
    return {
      kind: 'gap',
      gap: {
        what: '「章节」部件的说明栏排在图区之前，自动布局会左右对调，自适应外壳未加',
        impact: '章节高度仍固定',
        fix: '重编时把图区调到说明栏前面'
      }
    };
  }

  const itemSpacing = Math.round(c.x - (g.x + g.width));
  if (itemSpacing < 0) {
    return {
      kind: 'gap',
      gap: {
        what: `「章节」部件图区与说明栏重叠（间距 ${itemSpacing}），自适应外壳未加`,
        impact: '章节高度仍固定',
        fix: '检查源模板章节的图区与说明栏是否真的并排'
      }
    };
  }

  const absoluteChildIds = childIds.filter((id) => id !== graphicId && id !== columnId);
  return {
    kind: 'apply',
    spec: {
      mode: 'HORIZONTAL',
      itemSpacing,
      // 两栏顶对齐；取更靠上的那个当 padding，图区的相对下移量就保住了。
      padding: { top: Math.round(Math.min(g.y, c.y) - rootBox.y) },
      hugHeight: HUG_HEIGHT,
      absoluteChildIds
    }
  };
}
