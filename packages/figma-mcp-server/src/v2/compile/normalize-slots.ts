/**
 * 槽位命名归一化 —— 把项目原名改成本契约的统一槽位名。
 *
 * 为什么在编译期做：部件是我们自己库里的产物，改名不改外观、不碰源模板；
 * 而渲染期只按名字取值，就不需要猜形状、读 plugin data、写 anchors 配置。
 *
 * 判定复用探针的结构规则（`probe/detect.ts`），顺序上排在「收编」之后、
 * 「产物能力重算」之前：收编会把嵌套实例换成本库组件，名字规则得在那之后看。
 *
 * 规则：
 *   - 只改被判定为槽位的节点，绝不整树改名
 *   - 已是统一名的不动（幂等）；多个候选 → 不猜，记缺口
 *   - 关键槽位缺失 → 拒绝（`V2_COMPILE_SLOT_UNMAPPED`）
 *
 * Spec: openspec/changes/engine-multi-part-template-render (D1 / D2 / template-compile)
 */

import type { FigmaBackend } from '../figma-client.js';
import {
  buildProbeTree,
  isNumberText,
  isRoleText,
  structuredDescendants,
  texts,
  walk,
  walkStructured,
  type ProbeNode,
  type ProbeTree
} from '../probe/tree.js';
import { contentLinesOf, findNumberCarrier, isBadgeNode, pickGraphic, pickTitle } from '../probe/detect.js';
import {
  CHAPTER_SLOTS,
  CLUSTER_SLOTS,
  CRITICAL_SLOTS,
  OVERVIEW_TEXT_SLOTS,
  TOP_SLOTS,
  isBadgeFrame,
  isRoleFrame,
  type PartName
} from '../template-slots.js';
import type { Capabilities } from '../template/schema.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';
import { trace } from './trace.js';

export interface SlotRename {
  part: PartName;
  nodeId: string;
  from: string;
  to: string;
}

export interface NormalizeInput {
  backend: FigmaBackend;
  /** 已建好的部件组件 id（`parts.ts` 的产物）。 */
  parts: ReadonlyArray<{ part: PartName; nodeId: string }>;
  /** 源模板能力判定；缺省按契约缺省值。 */
  capabilities?: Pick<Capabilities, 'figure' | 'clusterGroups' | 'overview'>;
  onGap?: (gap: CompileGap) => void;
}

export interface NormalizeResult {
  renamed: SlotRename[];
  gaps: CompileGap[];
}

const SCAN_BUDGET = 20000;

type Rename = (part: PartName, node: ProbeNode, to: string) => Promise<void>;

/** 节点是否在某个实例内部（实例子层 id 形如 `I123;456`，父链里也会有 INSTANCE）。 */
function isInstanceSublayer(node: ProbeNode): boolean {
  if (node.id.includes(';')) return true;
  let parent = node.parent;
  while (parent) {
    if (parent.type === 'INSTANCE') return true;
    parent = parent.parent;
  }
  return false;
}

export async function normalizeSlotNames(input: NormalizeInput): Promise<NormalizeResult> {
  const { backend } = input;
  if (typeof backend.renameNode !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前 Figma 后端不支持 renameNode——无法把部件槽位统一命名'
    );
  }

  const renamed: SlotRename[] = [];
  const gaps: CompileGap[] = [];
  const gap = (g: CompileGap): void => {
    gaps.push(g);
    input.onGap?.(g);
  };

  const rename: Rename = async (part, node, to) => {
    if (node.name === to) return;
    // 实例子层（id 形如 `I123;456`）不能改名：`getNodeByIdAsync` 对这类 id 在
    // dynamic-page 下会一直不返回，整个编译卡在 10 秒超时上（真机实测）。
    // 渲染在 detach 之后自己按结构找，不依赖这里的名字。
    if (isInstanceSublayer(node)) {
      gap({
        what: `「${part}」里有一处槽位在实例内部（${node.id}），未改名`,
        impact: '渲染按结构兜底；若兜不住，该槽位会沿用原稿内容',
        fix: '把该实例从母版里 detach 成普通图层后重编'
      });
      return;
    }
    const from = node.name;
    const t0 = Date.now();
    try {
      await backend.renameNode!(node.id, to);
    } catch (e) {
      trace(`rename ${part} ${node.id} "${from}"->"${to}" FAILED after ${Date.now() - t0}ms: ${(e as Error).message}`);
      throw e;
    }
    const ms = Date.now() - t0;
    if (ms > 1000) trace(`rename ${part} ${node.id} "${from}"->"${to}" slow ${ms}ms`);
    node.name = to;
    renamed.push({ part, nodeId: node.id, from, to });
  };

  for (const { part, nodeId } of input.parts) {
    const tree = await scanPart(backend, nodeId);
    if (!tree) {
      gap({
        what: `「${part}」部件扫描不到（${nodeId}）`,
        impact: '槽位未归一化，渲染时按名字找不到槽位',
        fix: '确认部件仍在库文件里且页面可读'
      });
      continue;
    }

    if (part === 'top') {
      await normalizeTop(tree, rename, gap);
    } else if (part === 'chapter') {
      await normalizeChapter(tree, rename, gap);
    } else if (part === 'cluster') {
      await normalizeCluster(tree, rename, gap, {
        figure: input.capabilities?.figure ?? 'named-group',
        clusterGroups: input.capabilities?.clusterGroups ?? 'slot-run'
      });
    }

    const missing = missingCritical(part, tree);
    if (missing.length > 0) {
      throw compileError(
        COMPILE_CODES.SLOT_UNMAPPED,
        `「${part}」部件缺少关键槽位：${missing.join('、')}——` +
          '先确认粘进来的是正确的块，或改在库里补上这些槽位再重编'
      );
    }
  }

  return { renamed, gaps };
}

// --- part scanning -------------------------------------------------------

async function scanPart(backend: FigmaBackend, rootId: string): Promise<ProbeTree | undefined> {
  if (typeof backend.scanSubtree !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前 Figma 后端不支持 scanSubtree——无法定位部件槽位'
    );
  }
  const t0 = Date.now();
  const { nodes, truncated } = await backend.scanSubtree(rootId, SCAN_BUDGET);
  const ms = Date.now() - t0;
  trace(`scan ${rootId} nodes=${nodes.length} ${ms}ms`);
  return buildProbeTree(nodes, rootId, truncated);
}

function missingCritical(part: PartName, tree: ProbeTree): string[] {
  const wanted = CRITICAL_SLOTS.filter((s) => s.part === part);
  if (wanted.length === 0) return [];
  const names = new Set<string>();
  walk(tree.root, (n) => {
    names.add(n.name);
  });
  return wanted.filter((s) => !names.has(s.slot)).map((s) => s.slot);
}

// --- chapter -------------------------------------------------------------

async function normalizeChapter(
  tree: ProbeTree,
  rename: Rename,
  gap: (g: CompileGap) => void
): Promise<void> {
  const root = tree.root;
  // 标号容器也是「装着一堆小文本」的 Frame，绝不能被当成说明栏。
  // 注意：母版收口之后容器里通常只剩 1 个标号，所以不能要求「≥2 个子节点」，
  // 统一名 `气泡` 也算数。
  const isBadgeParent = (n: ProbeNode): boolean =>
    n.name === CHAPTER_SLOTS.badgeContainer ||
    (n.children.length >= 1 && n.children.every(isBadgeNode));

  // 部件根经常是一层包装（GROUP 不能直接转组件，编译会套一个 FRAME），
  // 真正的「图区 + 说明栏」在唯一的子节点里；标号容器是另挂的兄弟。
  const nonBadge = root.children.filter((c) => !isBadgeParent(c));
  const only = nonBadge.length === 1 ? nonBadge[0] : undefined;
  const body = only && only.children.length >= 2 ? only : root;

  const graphic = pickGraphic(body);
  // 说明栏至少装着一个簇（簇内 ≥2 个文本），否则它只是样式块或标号容器。
  // 例外：克隆即掏空之后说明栏是空的——此时「除图区外唯一的大块」就是它。
  // 已经叫 `#Name` 的那块是章节标题，绝不能当说明栏（蛋仔真机踩过：标题被
  // 改名成 `Text`，接着标题找不到、能力 `column` 也被算成 bottom）。
  const preTitleText = texts(root).find((t) => t.name === CHAPTER_SLOTS.sectionTitle);
  const preTitleBlock = preTitleText
    ? body.children.find((c) => subtreeIds([c]).has(preTitleText.id))
    : undefined;
  const preNamedColumn = root.children.find((c) => c.name === CHAPTER_SLOTS.clusterHost);
  const others = body.children.filter(
    (c) => c !== graphic && c !== preTitleBlock && !isBadgeParent(c)
  );
  const column =
    preNamedColumn ??
    (others.length === 1
      ? others[0]
      : others.filter((c) => texts(c).length >= 2).sort((a, b) => texts(b).length - texts(a).length)[0]);

  if (column) {
    await rename('chapter', column, CHAPTER_SLOTS.clusterHost);
  } else {
    gap({
      what: '章节部件里找不到「图示 + 说明栏」的说明栏',
      impact: '簇没有落脚点，渲染会失败',
      fix: '确认粘进来的是完整章节（图区 + 右侧说明栏）'
    });
  }

  if (graphic) {
    // 已经有 `主图占位` 就不要再认：舞台和主图同样宽 1200，先遍历到的是舞台，
    // 改名会把舞台整块变成「主图占位」（蛋仔真机踩过）。
    const hasImageSlot = structuredDescendants(root).some(
      (n) => n.name === CHAPTER_SLOTS.mainImage
    );
    const image = hasImageSlot ? undefined : widestImageSlot(graphic);
    if (image) await rename('chapter', image, CHAPTER_SLOTS.mainImage);

    const hint = texts(graphic).find((t) => /待手动替换|占位文案/.test(t.characters ?? ''));
    if (hint) await rename('chapter', hint, CHAPTER_SLOTS.mainImageHint);

    const badgeParent = findBadgeParent(graphic);
    if (badgeParent) await rename('chapter', badgeParent, CHAPTER_SLOTS.badgeContainer);
  }

  // 章节标题：图区与说明栏之外的短文本（1:14 的 `#Name` 就在图片上方的标签框里）。
  const excluded = subtreeIds([graphic, column]);
  const titleCandidates = preTitleText
    ? [preTitleText]
    : texts(root).filter((t) => {
        if (excluded.has(t.id)) return false;
        if (!t.visible) return false;
        const s = (t.characters ?? '').trim();
        if (s === '' || s.length > 24) return false;
        return !isNumberText(t) && !isRoleText(t);
      });
  if (titleCandidates.length === 1 && titleCandidates[0]) {
    await rename('chapter', titleCandidates[0], CHAPTER_SLOTS.sectionTitle);
  } else if (titleCandidates.length === 0) {
    gap({
      what: '章节部件里没有章节标题槽位（`#Name`）',
      impact: '渲染时不会写章节标题，其余内容不受影响',
      fix: '若该项目的章节标题是共用的一块，可忽略；否则把标题文本粘进章节块'
    });
  } else {
    gap({
      what: `章节部件里有 ${titleCandidates.length} 个可能作标题的短文本，未自动改名`,
      impact: '渲染时不会写章节标题',
      fix: '在库里把要作标题的那个文本改名为 `#Name` 后重编'
    });
  }
}

// --- cluster -------------------------------------------------------------

async function normalizeCluster(
  tree: ProbeTree,
  rename: Rename,
  gap: (g: CompileGap) => void,
  caps: { figure: Capabilities['figure']; clusterGroups: Capabilities['clusterGroups'] }
): Promise<void> {
  const root = tree.root;

  const carrier = findNumberCarrier(root);
  if (carrier) {
    await rename('cluster', carrier.node, CLUSTER_SLOTS.number);
    // `numberBadge=instance`：编号在实例内部的 TEXT 里。实例内部不改名（会卡死），
    // 渲染 detach 之后按「父级是编号载体」结构去找。
  } else {
    gap({
      what: '簇部件里找不到编号载体',
      impact: '渲染时无法写簇编号',
      fix: '确认簇块里保留了编号（文本或 num 实例）'
    });
  }

  const title = pickTitle(root);
  if (title) await rename('cluster', title, CLUSTER_SLOTS.title);

  const figure = findFigure(root, caps.figure, carrier?.node);
  if (figure) {
    await rename('cluster', figure, CLUSTER_SLOTS.figure);
    const rect = widestRectangle(figure);
    if (rect) await rename('cluster', rect, CLUSTER_SLOTS.figureRect);
    const hint = texts(figure).find((t) => /占位/.test(t.characters ?? '') || /占位/.test(t.name));
    if (hint) await rename('cluster', hint, CLUSTER_SLOTS.figureHint);
  }

  const roleFrames = findRoleFrames(root);
  for (const frame of roleFrames) await rename('cluster', frame, CLUSTER_SLOTS.roleFrame);

  // 分组槽必须在内容行之前定下来，否则 `小标题1` 这类短标题会被当成内容行。
  const groupSlots = texts(root).filter(
    (t) => t.name.startsWith(CLUSTER_SLOTS.groupSlot) && t.name !== CLUSTER_SLOTS.title
  );
  for (const slot of groupSlots) await rename('cluster', slot, CLUSTER_SLOTS.groupSlot);
  if (caps.clusterGroups === 'slot-run' && groupSlots.length === 0) {
    gap({
      what: '模板按 slot-run 处理分组，但簇部件里没有 `#Title` 分组槽位',
      impact: 'md 的 `####` 分组无处承载，渲染会拒绝',
      fix: '在簇块里保留至少一个分组标题槽位，或把能力改成 none / inline-subtitle'
    });
  }

  // 每一段 run 都可能带自己的配图槽；只排除第一个的话，第二段里的
  // `配图占位文案` 会被当成内容行改名成 `正文/规则`（真机踩过）。
  const figureRoots = structuredDescendants(root).filter(
    (n) => n.name === CLUSTER_SLOTS.figure && n !== figure
  );
  const excluded = subtreeIds([
    title,
    figure,
    carrier?.node,
    ...groupSlots,
    ...roleFrames,
    ...figureRoots
  ]);
  const bullets = contentLinesOf(root, title).filter((t) => !excluded.has(t.id));
  for (const bullet of bullets) await rename('cluster', bullet, CLUSTER_SLOTS.bullet);
}

// --- top -----------------------------------------------------------------

const HEADER_LABEL_PATTERNS: ReadonlyArray<{ slot: string; re: RegExp }> = [
  { slot: TOP_SLOTS.docTitle, re: /(文档名|文档标题|需求名称|需求名|方案名)/ },
  { slot: TOP_SLOTS.owner, re: /(设计师|设计者|负责人|审核者|^UI$|^UX$)/ },
  { slot: TOP_SLOTS.group, re: /(需求组|组别|所属组|团队)/ },
  { slot: TOP_SLOTS.ticketLink, re: /(单号|链接|易协作|工单|issue)/i },
  { slot: TOP_SLOTS.lastUpdate, re: /(日期|更新时间|更新日)/ }
];

async function normalizeTop(
  tree: ProbeTree,
  rename: Rename,
  gap: (g: CompileGap) => void
): Promise<void> {
  /** 已经归位到某个槽位的节点 id——自由排版那一段不能重复认领。 */
  const taken = new Set<string>();
  const take = async (node: ProbeNode, slot: string): Promise<void> => {
    taken.add(node.id);
    await rename('top', node, slot);
  };

  // 总览：同级里有两块「短标题 + 长正文」的块，按 1:14 顺序取前两块。
  const blocks = findOverviewBlocks(tree.root);
  if (blocks.length >= 2 && blocks[0] && blocks[1]) {
    await rename('top', blocks[0], TOP_SLOTS.overviewBackground);
    await rename('top', blocks[1], TOP_SLOTS.overviewCore);
    for (const block of [blocks[0], blocks[1]]) {
      const body = longestText(block);
      if (body) await rename('top', body, OVERVIEW_TEXT_SLOTS.body);
    }
    // 总览里的文本不算「自由排版」，否则正文会被当成文档标题认领。
    for (const id of subtreeIds([blocks[0], blocks[1]])) taken.add(id);
  } else if (blocks.length === 1) {
    gap({
      what: '顶部只找到一块总览（短标题 + 长正文），未按两栏归一化',
      impact: '若该模板是 single-block 总览，需要在库里手工确认',
      fix: '核对 capabilities.overview；确为单块则不处理'
    });
  }

  // 第一段：1:14 式「标签 + 值」成对出现。
  const assigned = new Map<string, string>();
  // 已经是统一名的直接算归位（1:14 的顶部文本就叫这些名字），不必再猜。
  const HEADER_SLOTS = [
    TOP_SLOTS.docTitle,
    TOP_SLOTS.owner,
    TOP_SLOTS.group,
    TOP_SLOTS.ticketLink,
    TOP_SLOTS.lastUpdate
  ];
  for (const slot of HEADER_SLOTS) {
    const existing = structuredDescendants(tree.root).find((n) => n.type === 'TEXT' && n.name === slot);
    if (existing) {
      assigned.set(slot, existing.id);
      taken.add(existing.id);
    }
  }

  for (const { slot, re } of HEADER_LABEL_PATTERNS) {
    if (assigned.has(slot)) continue;
    const pair = findLabelValuePair(tree.root, re);
    if (!pair || taken.has(pair.value.id)) continue;
    await take(pair.value, slot);
    assigned.set(slot, pair.value.id);
  }

  // `文档说明` 块整块排除出「自由排版」候选：那里面放的是需求链接 / 区块标题，
  // 最长的一条单号有 2000 多像素宽，按「面积最大」会把真正的大标题挤掉（蛋仔
  // 真机踩过：渲染出来大标题永远是模板里那句「局内相关交互」）。
  //
  // 但块里的链接本身是槽位：`易协作单号链接` 就写在那儿，先认领再排除。
  const introBlocks = structuredDescendants(tree.root).filter((n) => n.name === '文档说明');
  if (!assigned.has(TOP_SLOTS.ticketLink)) {
    for (const block of introBlocks) {
      const link = structuredDescendants(block).find(
        (n) => n.type === 'TEXT' && /(https?:\/\/|易协作|#\d{4,})/.test(n.characters ?? '')
      );
      if (link && !taken.has(link.id)) {
        await take(link, TOP_SLOTS.ticketLink);
        assigned.set(TOP_SLOTS.ticketLink, link.id);
        break;
      }
    }
  }
  for (const n of introBlocks) {
    for (const id of subtreeIds([n])) taken.add(id);
  }

  const freeTexts = structuredDescendants(tree.root).filter(
    (n) => n.type === 'TEXT' && n.visible && !taken.has(n.id) && (n.characters ?? '').trim() !== ''
  );

  if (!assigned.has(TOP_SLOTS.lastUpdate)) {
    const dateNode = freeTexts.find((n) => DATE_RE.test((n.characters ?? '').trim()));
    if (dateNode) {
      await take(dateNode, TOP_SLOTS.lastUpdate);
      assigned.set(TOP_SLOTS.lastUpdate, dateNode.id);
    }
  }

  if (!assigned.has(TOP_SLOTS.owner)) {
    const ownerNode = findOwnerValue(tree.root);
    if (ownerNode && !taken.has(ownerNode.id)) {
      await take(ownerNode, TOP_SLOTS.owner);
      assigned.set(TOP_SLOTS.owner, ownerNode.id);
    }
  }

  if (!assigned.has(TOP_SLOTS.docTitle)) {
    // 标题是顶部最大的那块文本；要求够长，避免把「职能注意」这类标签认成标题。
    const titleNode = freeTexts
      .filter((n) => !taken.has(n.id))
      .filter((n) => (n.characters ?? '').trim().length >= 4)
      .reduce<ProbeNode | undefined>((best, n) => {
        const area = (n.box?.width ?? 0) * (n.box?.height ?? 0);
        if (!best) return n;
        const bestArea = (best.box?.width ?? 0) * (best.box?.height ?? 0);
        return area > bestArea ? n : best;
      }, undefined);
    if (titleNode) {
      await take(titleNode, TOP_SLOTS.docTitle);
      assigned.set(TOP_SLOTS.docTitle, titleNode.id);
    }
  }

  for (const slot of HEADER_SLOTS) {
    if (assigned.has(slot)) continue;
    gap({
      what: `顶部没有认出槽位「${slot}」`,
      impact: '该字段渲染时空着；顶部里对不上的原稿文案会被清空',
      fix: '在库里给对应文本改成统一槽位名'
    });
  }
}

/** `2025/07/02`、`2025.7.2`、`2025年7月2日` 都算日期。 */
const DATE_RE = /^\d{4}\s*[/.\-年]\s*\d{1,2}/;

/**
 * 自由排版的「设计师」：同一父级下，`UX` / `UI` 这类短标签后面跟着 `/ 名字`。
 * 蛋仔顶部就是这样，名字前带斜杠。
 */
function findOwnerValue(root: ProbeNode): ProbeNode | undefined {
  let found: ProbeNode | undefined;
  walkStructured(root, (parent) => {
    if (found) return false;
    for (let i = 0; i < parent.children.length - 1; i += 1) {
      const label = parent.children[i];
      const value = parent.children[i + 1];
      if (!label || !value) continue;
      if (label.type !== 'TEXT' || value.type !== 'TEXT') continue;
      if (!/^(UI|UX|设计|设计师)$/i.test((label.characters ?? '').trim())) continue;
      if (!/^\/\s*\S+/.test((value.characters ?? '').trim())) continue;
      found = value;
      return false;
    }
    return undefined;
  });
  return found;
}

// --- structural helpers --------------------------------------------------

function subtreeIds(nodes: Array<ProbeNode | undefined>): Set<string> {
  const out = new Set<string>();
  for (const node of nodes) {
    if (!node) continue;
    walk(node, (n) => {
      out.add(n.id);
    });
  }
  return out;
}

/** 配图槽里的矩形（小图也合法）。只认 RECTANGLE：`配图` 本身可能就是它。 */
function widestRectangle(root: ProbeNode): ProbeNode | undefined {
  let best: { node: ProbeNode; width: number } | undefined;
  for (const n of structuredDescendants(root)) {
    if (n.type !== 'RECTANGLE') continue;
    const w = n.box?.width ?? 0;
    if (!best || w > best.width) best = { node: n, width: w };
  }
  return best?.node;
}

/**
 * 图区槽位：够大的 RECTANGLE / INSTANCE / FRAME。
 *
 * 项目的「主图」经常是一张 Slide 实例而不是裸矩形（蛋仔就是），只认 RECTANGLE
 * 会漏掉它；但实例内部不能改名，所以 `walkStructured` 把 INSTANCE 当叶子正好。
 */
function widestImageSlot(root: ProbeNode): ProbeNode | undefined {
  let best: { node: ProbeNode; width: number } | undefined;
  walkStructured(root, (n) => {
    if (n === root) return undefined;
    if (n.type !== 'RECTANGLE' && n.type !== 'INSTANCE' && n.type !== 'FRAME') return undefined;
    // 舞台里的气泡比主图宽（1920 > 1200），不能被当成主图——那会把标号容器
    // 改名成「主图占位」，渲染就再也找不到气泡了（蛋仔真机踩过）。
    if (isBadgeFrame(n.name) || n.name === CHAPTER_SLOTS.badgeContainer) return undefined;
    const w = n.box?.width ?? 0;
    if (w < 800) return undefined;
    if (!best || w > best.width) best = { node: n, width: w };
    return undefined;
  });
  return best?.node;
}

/** 容器：子节点全是小号编号载体（≥2 个）。 */
function findBadgeParent(root: ProbeNode): ProbeNode | undefined {
  let found: ProbeNode | undefined;
  walkStructured(root, (n) => {
    if (found) return false;
    if (n.children.length < 2) return undefined;
    if (n.children.every(isBadgeNode)) {
      found = n;
      return false;
    }
    return undefined;
  });
  return found;
}

function findFigure(
  root: ProbeNode,
  figure: Capabilities['figure'],
  numberCarrier: ProbeNode | undefined
): ProbeNode | undefined {
  if (figure === 'none') return undefined;
  const excluded = subtreeIds([numberCarrier]);

  if (figure === 'named-group') {
    let named: ProbeNode | undefined;
    walkStructured(root, (n) => {
      if (named) return false;
      if (n === root || excluded.has(n.id) || n.type === 'TEXT') return undefined;
      if (/配图|figure/i.test(n.name)) {
        named = n;
        return false;
      }
      return undefined;
    });
    return named;
  }

  // first-non-text：第一个「不含文本、够大」的非文本节点就是图。
  // 含文本的是排版容器（内容行所在的框），不是图，必须排除。
  let found: ProbeNode | undefined;
  walkStructured(root, (n) => {
    if (found) return false;
    if (n === root || excluded.has(n.id) || n.type === 'TEXT') return undefined;
    if (isRoleFrame(n.name)) return undefined;
    if ((n.box?.width ?? 0) < 120) return undefined;
    if (texts(n).length > 0) return undefined;
    found = n;
    return false;
  });
  return found;
}

/**
 * 簇里的全部职能标签帧。
 *
 * 每段 run 各带一个（`1:14` 是 `Frame 427319720` / `Frame 427319721`）。以前只认
 * 第一个，第二个既没改名也没删，渲染时成了孤儿节点，把上一份文档的角色标签一起
 * 带进产物。改名后由瘦身按 run 决定留谁。
 */
function findRoleFrames(root: ProbeNode): ProbeNode[] {
  const found: ProbeNode[] = [];
  walkStructured(root, (n) => {
    if (isRoleFrame(n.name)) {
      found.push(n);
      return false;
    }
    if (n.children.length < 3) return undefined;
    if (n.children.every((c) => c.type === 'TEXT' && isRoleText(c))) {
      found.push(n);
      return false;
    }
    return undefined;
  });
  return found;
}

function longestText(root: ProbeNode): ProbeNode | undefined {
  let best: { node: ProbeNode; len: number } | undefined;
  walk(root, (n) => {
    if (n.type !== 'TEXT') return undefined;
    const len = (n.characters ?? '').trim().length;
    if (!best || len > best.len) best = { node: n, len };
    return undefined;
  });
  return best?.node;
}

/**
 * 总览块：兄弟节点里「短标题 + 长正文」两块。
 * 只看直属父子，避免把整份文档当总览。
 */
function findOverviewBlocks(root: ProbeNode): ProbeNode[] {
  const blocks: ProbeNode[] = [];
  walkStructured(root, (parent) => {
    if (parent.children.length < 2) return undefined;
    for (const child of parent.children) {
      const inner = child.children.filter((c) => c.type === 'TEXT');
      if (inner.length !== 2) continue;
      const lengths = inner.map((t) => (t.characters ?? '').trim().length);
      if (lengths.some((l) => l < 2)) continue;
      if (Math.max(...lengths) < 10) continue;
      if ((child.box?.width ?? 0) < 200) continue;
      blocks.push(child);
    }
    return undefined;
  });
  // 去掉「包含另一个总览块」的外层，只留最内层。
  return blocks.filter((b) => !blocks.some((o) => o !== b && subtreeIds([b]).has(o.id)));
}

/** 同一个父级下，「标签 TEXT + 紧随其后的值 TEXT」。 */
function findLabelValuePair(
  root: ProbeNode,
  re: RegExp
): { label: ProbeNode; value: ProbeNode } | undefined {
  let found: { label: ProbeNode; value: ProbeNode } | undefined;
  walkStructured(root, (parent) => {
    if (found) return false;
    for (let i = 0; i < parent.children.length - 1; i += 1) {
      const label = parent.children[i];
      const value = parent.children[i + 1];
      if (!label || !value) continue;
      if (label.type !== 'TEXT' || value.type !== 'TEXT') continue;
      const text = (label.characters ?? '').trim();
      if (text === '' || text.length > 8) continue;
      if (!re.test(text)) continue;
      if ((value.characters ?? '').trim() === '') continue;
      if (isNumberText(value) && !re.test('日期')) continue;
      found = { label, value };
      return false;
    }
    return undefined;
  });
  return found;
}
