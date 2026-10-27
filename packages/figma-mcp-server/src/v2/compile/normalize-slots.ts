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
  isRoleFrame,
  type PartName
} from '../template-slots.js';
import type { Capabilities } from '../template/schema.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';

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
    const from = node.name;
    await backend.renameNode!(node.id, to);
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
  const { nodes, truncated } = await backend.scanSubtree(rootId, SCAN_BUDGET);
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
  const others = body.children.filter((c) => c !== graphic && !isBadgeParent(c));
  const column =
    others.length === 1
      ? others[0]
      : others.filter((c) => texts(c).length >= 2).sort((a, b) => texts(b).length - texts(a).length)[0];

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
    const image = widestImageSlot(graphic);
    if (image) await rename('chapter', image, CHAPTER_SLOTS.mainImage);

    const hint = texts(graphic).find((t) => /待手动替换|占位文案/.test(t.characters ?? ''));
    if (hint) await rename('chapter', hint, CHAPTER_SLOTS.mainImageHint);

    const badgeParent = findBadgeParent(graphic);
    if (badgeParent) await rename('chapter', badgeParent, CHAPTER_SLOTS.badgeContainer);
  }

  // 章节标题：图区与说明栏之外的短文本（1:14 的 `#Name` 就在图片上方的标签框里）。
  const excluded = subtreeIds([graphic, column]);
  const titleCandidates = texts(root).filter((t) => {
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
    // `numberBadge=instance`：编号在实例内部的 TEXT 里，渲染按名字写它，所以内层也要统一名。
    if (carrier.kind === 'instance') {
      const inner = texts(carrier.node).find((t) => isNumberText(t));
      if (inner) await rename('cluster', inner, CLUSTER_SLOTS.number);
    }
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

  const roleFrame = findRoleFrame(root);
  if (roleFrame) await rename('cluster', roleFrame, CLUSTER_SLOTS.roleFrame);

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

  const excluded = subtreeIds([title, figure, roleFrame, carrier?.node, ...groupSlots]);
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
  // 总览：同级里有两块「短标题 + 长正文」的块，按 1:14 顺序取前两块。
  const blocks = findOverviewBlocks(tree.root);
  if (blocks.length >= 2 && blocks[0] && blocks[1]) {
    await rename('top', blocks[0], TOP_SLOTS.overviewBackground);
    await rename('top', blocks[1], TOP_SLOTS.overviewCore);
    for (const block of [blocks[0], blocks[1]]) {
      const body = longestText(block);
      if (body) await rename('top', body, OVERVIEW_TEXT_SLOTS.body);
    }
  } else if (blocks.length === 1) {
    gap({
      what: '顶部只找到一块总览（短标题 + 长正文），未按两栏归一化',
      impact: '若该模板是 single-block 总览，需要在库里手工确认',
      fix: '核对 capabilities.overview；确为单块则不处理'
    });
  }

  // 顶部元信息：只处理「标签 + 值」成对出现的情况（1:14 直接是值文本，名字已统一）。
  const used = new Set<string>();
  for (const { slot, re } of HEADER_LABEL_PATTERNS) {
    if (used.has(slot)) continue;
    const pair = findLabelValuePair(tree.root, re);
    if (!pair) continue;
    await rename('top', pair.value, slot);
    used.add(slot);
  }
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

function findRoleFrame(root: ProbeNode): ProbeNode | undefined {
  let found: ProbeNode | undefined;
  walkStructured(root, (n) => {
    if (found) return false;
    if (isRoleFrame(n.name)) {
      found = n;
      return false;
    }
    if (n.children.length < 3) return undefined;
    if (n.children.every((c) => c.type === 'TEXT' && isRoleText(c))) {
      found = n;
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
