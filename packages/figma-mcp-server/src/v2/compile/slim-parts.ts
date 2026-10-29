/**
 * 部件瘦身 —— 编译期把「克隆母版」留下的原稿内容清掉，让部件变成空壳。
 *
 * 为什么要做：蛋仔的章节部件编译后带着原模板全部 5 个簇（7235 个节点）。
 * 渲染每次都要在这棵大树里扫描 / 删除，插件直接被打到断连。空壳化之后
 * 渲染只需要「填」，不需要「搬」。
 *
 * 保留的东西就是样式载体：图区几何、说明栏容器、标号母版、隐藏备用池。
 *
 * Spec: openspec/changes/template-compile-slim-parts
 */

import type { FigmaBackend, NodeInfo } from '../figma-client.js';import {
  BADGE_MASTER_NAME,
  CHAPTER_SLOTS,
  CLUSTER_SLOTS,
  OVERVIEW_TEXT_SLOTS,
  TOP_SLOTS,
  type PartName
} from '../template-slots.js';
import type { Capabilities } from '../template/schema.js';
import { firstCompleteRun, runMemberIds, splitRuns, type SlotRun } from '../template/runs.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';
import { trace } from './trace.js';

const SCAN_BUDGET = 20000;

export interface SlimInput {
  backend: FigmaBackend;
  parts: ReadonlyArray<{ part: PartName; nodeId: string }>;
  /**
   * 产物能力：顶部清残留只在「没有总览区」时做（总览区的标题文本要留着）；
   * 簇里的原稿媒体怎么清，取决于模板有没有配图位；run 怎么切，取决于分组能力。
   */
  capabilities?: Pick<Capabilities, 'overview' | 'figure' | 'clusterGroups'>;
}

export interface SlimResult {
  deleted: number;
  /** 清空字符的文本数（顶部残留值，保留版式骨架）。 */
  cleared: number;
  gaps: CompileGap[];
}

export async function slimParts(input: SlimInput): Promise<SlimResult> {
  const { backend } = input;
  if (typeof backend.scanSubtree !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前 Figma 后端不支持 scanSubtree——无法给部件做空壳化'
    );
  }

  let deleted = 0;
  let cleared = 0;
  const gaps: CompileGap[] = [];

  for (const { part, nodeId } of input.parts) {
    if (part === 'chapter') {
      deleted += await slimChapter(backend, nodeId, gaps);
    } else if (part === 'cluster') {
      deleted += await slimCluster(
        backend,
        nodeId,
        input.capabilities?.figure ?? 'named-group',
        input.capabilities?.clusterGroups ?? 'slot-run',
        gaps
      );
    } else if (part === 'top' && input.capabilities?.overview === 'none') {
      cleared += await slimTop(backend, nodeId);
    }
    cleared += await placeholderSlotTexts(backend, nodeId);
    // 居中放在占位文本之后：占位文案的宽窄会改变整行/整组的宽度，先居中再换字
    // 就等于白算（真机踩过：簇标题偏了 18px）。
    const { nodes: fresh } = await backend.scanSubtree(nodeId, SCAN_BUDGET);
    if (part === 'top') await centerTopTagRow(backend, fresh);
    if (part === 'cluster') await alignClusterHeading(backend, fresh);
  }

  return { deleted, cleared, gaps };
}

/**
 * 槽位文本一律换成占位符。
 *
 * 部件是模板，里面不该留上一份需求的真内容：`文档标题` 还挂着一条易协作单号、
 * `正文/规则` 还是上一版的规则、`#Title_Main` 还是「撤离」。渲染会按槽位名覆盖，
 * 但库里打开部件、或渲染缺字段时，看到的就是这些旧文案。
 */
const SLOT_PLACEHOLDERS: Record<string, string> = {
  [TOP_SLOTS.docTitle]: '文档标题',
  [TOP_SLOTS.owner]: '/设计师名称',
  [TOP_SLOTS.group]: '/需求组',
  [TOP_SLOTS.ticketLink]: '#单号',
  [TOP_SLOTS.lastUpdate]: 'YYYY.MM.DD',
  [OVERVIEW_TEXT_SLOTS.body]: '正文占位',
  [CHAPTER_SLOTS.sectionTitle]: '界面名称',
  [CLUSTER_SLOTS.title]: '簇标题',
  [CLUSTER_SLOTS.bullet]: '正文占位'
};

async function placeholderSlotTexts(backend: FigmaBackend, partId: string): Promise<number> {
  if (typeof backend.setMultipleTextContents !== 'function') return 0;
  const { nodes } = await backend.scanSubtree(partId, SCAN_BUDGET);
  const updates: Array<{ nodeId: string; characters: string }> = [];
  for (const n of nodes) {
    if (n.type !== 'TEXT' || isSublayer(n.id) || n.visible === false) continue;
    const placeholder = SLOT_PLACEHOLDERS[n.name];
    if (!placeholder) continue;
    if ((n.characters ?? '') === placeholder) continue;
    updates.push({ nodeId: n.id, characters: placeholder });
  }
  if (updates.length === 0) return 0;
  await backend.setMultipleTextContents(updates);
  return updates.length;
}

/**
 * 顶部：没有总览区时，顶部只剩 5 个元信息字段，其余原稿文案得清掉。
 *
 * 不清的后果：蛋仔顶部是自由排版（`局内相关交互` / `-未开始` / `/辉湟`），
 * 归一化认不出这些字段，渲染找不到槽位就原样留在产物里——设计师看到的是上
 * 一份需求的旧文案。
 *
 * 清字符而不是删节点：顶部版式靠这些文本的位置撑着，删了整块会塌。
 */
async function slimTop(backend: FigmaBackend, topId: string): Promise<number> {
  const { nodes } = await backend.scanSubtree(topId, SCAN_BUDGET);
  const keep = new Set<string>([
    TOP_SLOTS.docTitle,
    TOP_SLOTS.owner,
    TOP_SLOTS.group,
    TOP_SLOTS.ticketLink,
    TOP_SLOTS.lastUpdate,
    OVERVIEW_TEXT_SLOTS.body
  ]);
  // 文档说明块是模板自带的静态区（放需求链接之类）：骨架要留，内容是上一份
  // 需求的，留着就是脏数据。
  const introIds = new Set<string>();
  for (const n of nodes) {
    if (n.name !== '文档说明') continue;
    for (const child of subtreeIdsOf(nodes, n.id)) introIds.add(child);
  }
  const stale = nodes.filter(
    (n) =>
      n.type === 'TEXT' &&
      n.visible !== false &&
      !isSublayer(n.id) &&
      (n.characters ?? '').trim() !== '' &&
      !keep.has(n.name) &&
      // 只清「值」：`/辉湟`、`#367218`、`https://…` 是上一份需求的数据。
      // 标签（`策划`）、区块标题（`文档说明` / `界面说明`）都是版式的一部分，
      // 清掉整块就塌了 —— 真机踩过：拆平实例后这两个标题被当成残留清空。
      looksLikeValue((n.characters ?? '').trim())
  );
  if (stale.length === 0) return 0;
  if (typeof backend.setMultipleTextContents !== 'function') return 0;
  const t0 = Date.now();
  // 值清空后不能留空串：`策划` / `UX` 这些标签会变成孤零零一行，看上去就是
  // 「信息漏了」。统一填占位符，版式保持原样，下一份文档照样看得懂这一行是什么。
  await backend.setMultipleTextContents(
    stale.map((n) => ({
      nodeId: n.id,
      characters: VALUE_PLACEHOLDER
    }))
  );
  trace(`slimTop cleared=${stale.length} ${Date.now() - t0}ms`);
  return stale.length;
}

/**
 * 「值样式」文本：`/辉湟`、`-未开始`、`#367218`、`https://…`。
 *
 * 判断依据是**写法**，不是位置：区块标题（`文档说明` / `界面说明`）和标签
 * （`策划` / `职能注意`）都不长这样，也就不会被当成上一份需求的残留清掉。
 */
function looksLikeValue(text: string): boolean {
  return isValueText(text) || /^(https?:\/\/|#\d{3,})/.test(text) || /https?:\/\//.test(text);
}

/** 顶部值槽（`/辉湟`、`/苗儿`）清空后留下的占位符。 */
const VALUE_PLACEHOLDER = '/待补充';

/**
 * 实例子层：id 形如 `I123;456`（Figma 用 `;` 串起祖先 id）。
 *
 * 这类节点不能按 id 读写——dynamic-page 下 `getNodeByIdAsync` 对它们永远不返回，
 * 直接把整次编译卡进 10 秒超时。它们属于实例内部，也不该被单独删 / 改名。
 */
function isSublayer(id: string): boolean {
  return id.includes(';');
}

/**
 * 顶部里的「值文本」：`/辉湟`、`/ 邵腾`、`-未开始` 这种。
 *
 * 标签（`策划`、`审核者`、`职能注意`、`GUI`）要留着撑版式，只有值会被上一份
 * 需求的内容污染，必须清掉。
 */
function isValueText(text: string): boolean {
  return /^[/\-－—]/.test(text);
}

/** 扁平节点表里，某节点子树内所有节点的 id（含自身）。 */
function subtreeIdsOf(
  nodes: ReadonlyArray<{ id: string; parentId?: string }>,
  rootId: string
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n.id);
    childrenOf.set(n.parentId, list);
  }
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(id);
    for (const child of childrenOf.get(id) ?? []) queue.push(child);
  }
  return out;
}

/** 章节：说明栏清空（只留容器），标号容器只留母版。 */
async function slimChapter(
  backend: FigmaBackend,
  chapterId: string,
  gaps: CompileGap[]
): Promise<number> {
  const { nodes } = await backend.scanSubtree(chapterId, SCAN_BUDGET);
  let deleted = 0;

  const host = nodes.find((n) => n.name === CHAPTER_SLOTS.clusterHost);
  if (!host) {
    gaps.push({
      what: '章节部件里找不到说明栏容器',
      impact: '空壳化跳过，部件仍带原稿簇',
      fix: '重编前先确认归一化已通过'
    });
    return deleted;
  }
  deleted += await deleteChildren(backend, host.id);

  const bubble = nodes.find((n) => n.name === CHAPTER_SLOTS.badgeContainer);
  if (bubble) {
    const kids = (await backend.getNodeInfo(bubble.id)).childIds ?? [];
    const infos = kids.length > 0 ? await backend.getNodesInfo(kids) : [];
    const stale = infos
      .filter((n) => n.name !== BADGE_MASTER_NAME && n.name.startsWith('标号/'))
      .map((n) => n.id);
    deleted += await deleteAll(backend, stale);
  }

  return deleted;
}

/**
 * 簇：按 run 瘦身。
 *
 * 保留第一个完整 run 的全部成员（正文有几条留几条、职能帧 1 个、配图 1 个），
 * 其余 run 连根整删。以前按名字全局裁剪，会把第二段的 `#Title` / 职能帧 / 配图
 * 当成 run 1 的多余兄弟留下来，或反过来把 run 2 整个拍平。
 *
 * Spec: slot-run-contract「簇部件按 run 瘦身」
 */
async function slimCluster(
  backend: FigmaBackend,
  clusterId: string,
  figure: Capabilities['figure'],
  mode: Capabilities['clusterGroups'],
  gaps: CompileGap[]
): Promise<number> {
  const { nodes } = await backend.scanSubtree(clusterId, SCAN_BUDGET);
  let deleted = 0;

  const info = await backend.getNodeInfo(clusterId);
  const childIds = info.childIds ?? [];
  const children = childIds.length > 0 ? await backend.getNodesInfo(childIds) : [];
  // 隐藏备用池与实例内部节点不参与 run 判定，但也不删（池子是样式载体）。
  const visible = children.filter((n) => n.visible !== false && !isSublayer(n.id));

  const split = splitRuns(visible, mode);
  const keep = firstCompleteRun(split.runs);

  if (mode === 'slot-run' && !keep) {
    // 切不出 run 也要把媒体清干净：编译期会拒绝这个产物，但留一堆原稿截图
    // 只会让失败现场更难看清。这里不删正文，失败信息已经指出问题在哪。
    gaps.push({
      what: `簇 ${clusterId} 切不出完整 run（没有 #Title 或没有 正文/规则）`,
      impact: '编译期会拒绝该产物；本次只做媒体清理',
      fix: '确认归一化已把分组标题改成 #Title、内容行改成 正文/规则'
    });
  }

  const doomed: string[] = [];
  if (keep) {
    for (const run of split.runs) {
      if (run === keep) {
        doomed.push(...run.extras.map((n) => n.id));
        continue;
      }
      doomed.push(...runMemberIds(run));
    }
  }
  const doomedSet = new Set(doomed);
  deleted += await deleteAll(backend, [...doomedSet]);

  await unstickTitleFromNumber(backend, nodes);
  deleted += await slimClusterMedia(backend, nodes, figure, keep, doomedSet);

  return deleted;
}

/**
 * 簇标题别压在编号上 —— 编译期就把位置摆正。
 *
 * 源稿把 `#Title_Main` 的 x 按原字体宽度定死，字体统一成 Noto Sans SC 之后编号
 * 里的数字变宽，就把标题第一个字盖住（库里打开部件第一眼就是这个）。渲染期也有
 * 同样的保护，但部件本身也得是干净的：设计师看的是部件。
 */
async function unstickTitleFromNumber(
  backend: FigmaBackend,
  nodes: ReadonlyArray<NodeInfo>
): Promise<void> {
  if (typeof backend.moveNode !== 'function') return;
  const title = nodes.find((n) => n.name === CLUSTER_SLOTS.title && !isSublayer(n.id));
  if (!title || typeof title.x !== 'number' || typeof title.y !== 'number') return;
  const carrier = nodes.find(
    (n) =>
      n.name === CLUSTER_SLOTS.number &&
      n.id !== title.id &&
      n.parentId === title.parentId &&
      n.absoluteBoundingBox !== undefined
  );
  const titleBox = title.absoluteBoundingBox;
  const numberBox = carrier?.absoluteBoundingBox;
  if (!numberBox || !titleBox) return;

  const delta = numberBox.x + numberBox.width + 8 - titleBox.x;
  if (delta <= 0.5) return;
  await backend.moveNode(title.id, title.x + delta, title.y);
}

/**
 * 编号角标与簇标题**垂直居中对齐**，水平方向保持模板的靠左排版。
 *
 * 角标是三角形（63 高），标题文字 52 高，两者都贴顶时文字看着往下掉一截；
 * 按中线对齐才是一条水平线。
 */
async function alignClusterHeading(
  backend: FigmaBackend,
  nodes: ReadonlyArray<NodeInfo>
): Promise<void> {
  if (typeof backend.moveNode !== 'function') return;
  const title = nodes.find((n) => n.name === CLUSTER_SLOTS.title && !isSublayer(n.id));
  const carrier = nodes.find(
    (n) => n.name === CLUSTER_SLOTS.number && n.parentId === title?.parentId
  );
  if (!title || !carrier) return;
  const [freshTitle, freshCarrier] = await backend.getNodesInfo([title.id, carrier.id]);
  const tb = freshTitle?.absoluteBoundingBox;
  const nb = freshCarrier?.absoluteBoundingBox;
  if (!tb || !nb) return;
  const delta = tb.y + (tb.height - nb.height) / 2 - nb.y;
  if (Math.abs(delta) < 0.5) return;
  if (typeof freshCarrier.x !== 'number' || typeof freshCarrier.y !== 'number') return;
  await backend.moveNode(carrier.id, freshCarrier.x, freshCarrier.y + delta);
}

/**
 * 顶部「职能注意 + 标签行」整行水平居中。
 *
 * 蛋仔顶部这一行是自由排版的：左侧一个短标签，右侧一串职能标签实例，整体靠左。
 * 归一并空壳化之后行宽是固定的，所以编译期一次算好。判定用结构（同一父级下
 * 「短文本 + 装着多个实例的 FRAME」），不认图层名。
 */
async function centerTopTagRow(
  backend: FigmaBackend,
  nodes: ReadonlyArray<NodeInfo>
): Promise<void> {
  if (typeof backend.moveNode !== 'function') return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const row = nodes.find((n) => {
    if (n.type !== 'FRAME' || n.visible === false) return false;
    const kids = (n.childIds ?? []).map((id) => byId.get(id)).filter(Boolean);
    return kids.length >= 2 && kids.every((k) => k!.type === 'INSTANCE');
  });
  if (!row || !row.parentId) return;
  const label = nodes
    .filter(
      (n) => n.type === 'TEXT' && n.parentId === row.parentId && n.visible !== false && n.absoluteBoundingBox
    )
    .filter((n) => (n.absoluteBoundingBox!.x ?? 0) + (n.absoluteBoundingBox!.width ?? 0) <= (row.absoluteBoundingBox?.x ?? 0) + 1)
    // 紧贴在标签行左边的那一个（右边缘最靠右），不是「x 最大」——同一行里
    // 更新时间之类也在左边，按 x 排会抓错（真机踩过：挪的是日期）。
    .sort(
      (a, b) =>
        (b.absoluteBoundingBox!.x ?? 0) + (b.absoluteBoundingBox!.width ?? 0) -
        ((a.absoluteBoundingBox!.x ?? 0) + (a.absoluteBoundingBox!.width ?? 0))
    )[0];
  if (!label) return;
  const parent = byId.get(row.parentId);
  const parentW = parent?.absoluteBoundingBox?.width;
  const rb = row.absoluteBoundingBox;
  const lb = label.absoluteBoundingBox;
  if (!parentW || !rb || !lb) return;
  const left = lb.x;
  const right = rb.x + rb.width;
  const parentLeft = parent?.absoluteBoundingBox?.x ?? 0;

  // 同一行右侧可能还有别的块（蛋仔右上角是「审核者 / 设计师名称」）。居中的
  // 可用宽度只能算到那一块的左边缘，否则整行会撞上去（真机截图直接压字）。
  const sameLineRight = nodes
    .filter((n) => n.id !== row.id && n.id !== label.id && n.visible !== false && n.absoluteBoundingBox)
    .filter((n) => {
      const b = n.absoluteBoundingBox!;
      const overlapsY = b.y < rb.y + rb.height && b.y + b.height > rb.y;
      return overlapsY && b.x >= right - 1;
    })
    .reduce<number>((min, n) => Math.min(min, n.absoluteBoundingBox!.x), parentLeft + parentW);

  const limit = sameLineRight - parentLeft;
  await shiftPair(backend, [label, row], parentLeft + (limit - (right - left)) / 2 - left);
}

/** 同一父级下的两个节点整体平移 `shift`（局部坐标加同样量）。 */
async function shiftPair(
  backend: FigmaBackend,
  nodes: ReadonlyArray<NodeInfo>,
  shift: number
): Promise<void> {
  if (typeof backend.moveNode !== 'function' || Math.abs(shift) < 0.5) return;
  for (const n of nodes) {
    // 局部坐标可能没被后端报回来；那就用绝对坐标减父级原点兜底。
    let x = n.x;
    let y = n.y;
    if (typeof x !== 'number' || typeof y !== 'number') {
      const abs = n.absoluteBoundingBox;
      const parent = n.parentId ? await backend.getNodeInfo(n.parentId) : undefined;
      const pAbs = parent?.absoluteBoundingBox;
      if (!abs || !pAbs) continue;
      x = abs.x - pAbs.x;
      y = abs.y - pAbs.y;
    }
    await backend.moveNode(n.id, x + shift, y);
  }
}

/**
 * 簇里的原稿媒体 —— 上一份需求的画面。
 *
 * 蛋仔的簇带 3 张 872×490 的原稿截图 + 1 张 127×123 的按钮截图；原本只把它们
 * 换成同尺寸的 `配图占位` 就收工，结果每簇渲染出来挂 3 个空框（`figure = none`
 * 时渲染根本不消费它们）。规则：
 *
 * - 模板没有配图位（`figure = none`）→ 媒体全是残留，一个不留
 * - 有配图位 → 只保留 run 里的 `配图`（没有就取最大的一块媒体当槽），其余删掉
 *
 * 保留的那个槽必须归一成 GROUP：以前用 `replaceWithPlaceholder` 原地替换，会把
 * 模板自带的 GROUP 拍平成裸矩形、连 `配图占位文案` 一起丢掉。
 */
async function slimClusterMedia(
  backend: FigmaBackend,
  nodes: ReadonlyArray<NodeInfo>,
  figure: Capabilities['figure'],
  keepRun: SlotRun | undefined,
  alreadyDeleted: ReadonlySet<string>
): Promise<number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const slotId = keepRun?.figure?.id;

  // 媒体容器算媒体：蛋仔的截图外面裹着 Group 427319372 这类 GROUP，只删里面的
  // 实例会在簇里留一个空壳容器。
  const memo = new Map<string, boolean>();
  const isMedia = (id: string, seen = new Set<string>()): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (!node) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    const self = isClusterMedia(node);
    const kids = node.childIds ?? [];
    const verdict =
      self ||
      ((node.type === 'GROUP' || node.type === 'FRAME') &&
        kids.length > 0 &&
        kids.every((c) => isMedia(c, seen)));
    memo.set(id, verdict);
    return verdict;
  };

  // 要保留的槽连同子树一起排除在「该删的媒体」之外。
  const insideSlot = (id: string): boolean => {
    if (!slotId) return false;
    let cur: string | undefined = id;
    while (cur) {
      if (cur === slotId) return true;
      cur = byId.get(cur)?.parentId;
    }
    return false;
  };

  // 已经随 run 整段删掉的节点（含子树）不再参与媒体判定，否则同一批节点会被数两次。
  const wasDeleted = (id: string): boolean => {
    let cur: string | undefined = id;
    while (cur) {
      if (alreadyDeleted.has(cur)) return true;
      cur = byId.get(cur)?.parentId;
    }
    return false;
  };

  const media = nodes.filter(
    (n) =>
      !isSublayer(n.id) &&
      n.visible !== false &&
      !wasDeleted(n.id) &&
      isMedia(n.id) &&
      !insideSlot(n.id)
  );

  const ids = new Set(media.map((n) => n.id));
  const outermost = media.filter((n) => {
    let parentId = n.parentId;
    while (parentId) {
      if (ids.has(parentId)) return false;
      parentId = byId.get(parentId)?.parentId;
    }
    return true;
  });

  if (figure === 'none') {
    return deleteAll(backend, outermost.map((n) => n.id));
  }

  const area = (n: NodeInfo) =>
    (n.absoluteBoundingBox?.width ?? 0) * (n.absoluteBoundingBox?.height ?? 0);
  const sorted = [...outermost].sort((a, b) => area(b) - area(a));
  // run 里没有 `配图` 时（`first-non-text` 模板），最大的一块媒体就是槽。
  const fallback = slotId ? undefined : sorted[0];
  const deleted = await deleteAll(
    backend,
    sorted.filter((n) => n !== fallback).map((n) => n.id)
  );

  const slot = slotId ? byId.get(slotId) : fallback;
  if (slot) await ensureFigureGroup(backend, nodes, slot);
  return deleted;
}

/**
 * 把配图槽归一成 `配图` GROUP + `配图占位` 矩形 + `配图占位文案`。
 *
 * 已是 GROUP 的原地清洗（清旧图、补缺失的文案），裸矩形 / 原稿实例包壳。
 */
async function ensureFigureGroup(
  backend: FigmaBackend,
  nodes: ReadonlyArray<NodeInfo>,
  slot: NodeInfo
): Promise<void> {
  const subtree =
    slot.type === 'GROUP' || slot.type === 'FRAME'
      ? descendantsOf(nodes, slot.id)
      : [];

  if (slot.type === 'GROUP') {
    const rect =
      subtree.find((n) => n.name === CLUSTER_SLOTS.figureRect && n.type === 'RECTANGLE') ??
      widest(subtree.filter((n) => n.type === 'RECTANGLE'));
    if (!rect) {
      throw compileError(
        COMPILE_CODES.SLOT_UNMAPPED,
        `配图 GROUP ${slot.id} 里没有矩形——无法作为填图目标`
      );
    }
    await clearImageFills(backend, [slot, ...subtree]);
    if (rect.name !== CLUSTER_SLOTS.figureRect) {
      await renameIfPossible(backend, rect.id, CLUSTER_SLOTS.figureRect);
    }
    const hint = subtree.find((n) => n.type === 'TEXT');
    if (hint) {
      if (hint.name !== CLUSTER_SLOTS.figureHint) {
        await renameIfPossible(backend, hint.id, CLUSTER_SLOTS.figureHint);
      }
      return;
    }
    await createHint(backend, slot.id, rect);
    return;
  }

  const parentId = slot.parentId ?? (await backend.getNodeInfo(slot.id)).parentId;
  if (!parentId) {
    throw compileError(
      COMPILE_CODES.SLOT_UNMAPPED,
      `配图槽 ${slot.id} 没有父级——无法包成 GROUP`
    );
  }
  if (typeof backend.groupNodes !== 'function' || typeof backend.createText !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前后端不支持 groupNodes / createText——无法把裸矩形配图归一成 GROUP'
    );
  }
  await clearImageFills(backend, [slot]);
  const group = await backend.groupNodes({
    parentId,
    name: CLUSTER_SLOTS.figure,
    childIds: [slot.id]
  });
  await renameIfPossible(backend, slot.id, CLUSTER_SLOTS.figureRect);
  await createHint(backend, group.id, slot);
}

async function clearImageFills(
  backend: FigmaBackend,
  nodes: ReadonlyArray<NodeInfo>
): Promise<void> {
  if (typeof backend.clearFills !== 'function') return;
  const ids = nodes
    .filter((n) => n.hasImageFill === true || n.type === 'RECTANGLE')
    .map((n) => n.id);
  if (ids.length > 0) await backend.clearFills(ids);
}

async function createHint(
  backend: FigmaBackend,
  parentId: string,
  rect: NodeInfo
): Promise<void> {
  if (typeof backend.createText !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前后端不支持 createText——无法给配图槽补占位文案'
    );
  }
  const box = rect.absoluteBoundingBox;
  await backend.createText({
    parentId,
    name: CLUSTER_SLOTS.figureHint,
    characters: '配图占位',
    ...(box
      ? { box: { x: 0, y: 0, width: box.width, height: box.height } }
      : {})
  });
}

async function renameIfPossible(
  backend: FigmaBackend,
  nodeId: string,
  name: string
): Promise<void> {
  if (typeof backend.renameNode !== 'function') return;
  await backend.renameNode(nodeId, name);
}

function descendantsOf(nodes: ReadonlyArray<NodeInfo>, rootId: string): NodeInfo[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: NodeInfo[] = [];
  const walk = (id: string): void => {
    for (const childId of byId.get(id)?.childIds ?? []) {
      const child = byId.get(childId);
      if (!child) continue;
      out.push(child);
      walk(childId);
    }
  };
  walk(rootId);
  return out;
}

function widest(nodes: ReadonlyArray<NodeInfo>): NodeInfo | undefined {
  return [...nodes].sort(
    (a, b) => (b.absoluteBoundingBox?.width ?? 0) - (a.absoluteBoundingBox?.width ?? 0)
  )[0];
}

/** 簇里的「原稿媒体」：配图槽本身、图片填充节点、原稿大截图。 */
function isClusterMedia(n: {
  name: string;
  type: string;
  hasImageFill?: boolean;
  absoluteBoundingBox?: { width: number; height: number };
}): boolean {
  if (n.name === CLUSTER_SLOTS.figure || n.name === CLUSTER_SLOTS.figureRect) return true;
  if (n.hasImageFill === true) return true;
  return (
    n.type === 'INSTANCE' &&
    (n.absoluteBoundingBox?.width ?? 0) >= 400 &&
    (n.absoluteBoundingBox?.height ?? 0) >= 300
  );
}

async function deleteChildren(backend: FigmaBackend, parentId: string): Promise<number> {
  const ids = (await backend.getNodeInfo(parentId)).childIds ?? [];
  return deleteAll(backend, ids);
}

/** 分批删除：一次删一大片会让插件长时间占住主线程，连接层直接判超时。 */
async function deleteAll(backend: FigmaBackend, ids: string[]): Promise<number> {
  for (let i = 0; i < ids.length; i += 2) {
    await backend.deleteNodes(ids.slice(i, i + 2));
  }
  return ids.length;
}
