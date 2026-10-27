/**
 * Structural detectors: chapter, cluster, badge, sub-run, master.
 *
 * Naming-independent by construction — the two real templates share almost no
 * layer names (`界面说明1` / `Group 2360`, `说明块01` / `Frame 1245`). The rules
 * only look at shape:
 *
 *   chapter = a unit whose direct children include BOTH a big graphic and a
 *             text column (the column holding ≥4 texts)
 *   cluster = a child of that column that holds ≥2 texts plus an anchor
 *             (a number carrier, or a short title followed by a content line)
 *   badge   = a small child carrying a digits-only TEXT
 *   sub-run = ≥2 sibling TEXTs with short characters (the `#Title` groups)
 */

import {
  structuredDescendants,
  walkStructured,
  hasInlineRoleMention,
  isNumberText,
  isRoleText,
  shapeSignature,
  texts,
  walk,
  type ProbeNode,
  type ProbeTree
} from './tree.js';

export interface RepetitionGroup {
  parent: ProbeNode;
  members: ProbeNode[];
  kind: 'badge' | 'subrun';
}

export interface MasterRef {
  nodeId: string;
  name: string;
  kind: 'repeated' | 'hidden' | 'template' | 'single';
}

export interface ChapterInfo {
  node: ProbeNode;
  graphic: ProbeNode;
  textZone: ProbeNode;
  clusters: ProbeNode[];
}

export interface ClusterInfo {
  node: ProbeNode;
  title?: ProbeNode;
  number?: ProbeNode;
  numberKind: 'text' | 'instance' | 'none';
  contentLines: ProbeNode[];
  hiddenTail: number;
}

export interface DetectionResult {
  top?: ProbeNode;
  chapters: ChapterInfo[];
  clusters: ClusterInfo[];
  chapterMaster?: MasterRef;
  clusterMaster?: MasterRef;
  badgeGroup?: RepetitionGroup;
  subrunGroup?: RepetitionGroup;
}

const GRAPHIC_MIN_WIDTH = 1000;
const ROLE_GROUP_MIN = 3;

// --- primitives ----------------------------------------------------------

function subtreeSize(node: ProbeNode): number {
  return 1 + structuredDescendants(node).length;
}

function nonEmptyTexts(node: ProbeNode): ProbeNode[] {
  const out: ProbeNode[] = [];
  walkStructured(node, (n) => {
    if (n.type === 'TEXT' && (n.characters ?? '').trim() !== '') out.push(n);
    return undefined;
  });
  return out;
}

/** Widest image-ish node inside this subtree. */
function graphicWidth(node: ProbeNode): number {
  let max = 0;
  walkStructured(node, (n) => {
    if (n.type === 'RECTANGLE' || n.type === 'INSTANCE' || n.type === 'GROUP') {
      const w = n.box?.width ?? 0;
      if (w > max) max = w;
    }
    return undefined;
  });
  return max;
}

/**
 * Number carrier — the ONE case that must look inside an INSTANCE: a `num`
 * badge component keeps its digit in an inner TEXT.
 */
export function findNumberCarrier(node: ProbeNode): { node: ProbeNode; kind: 'text' | 'instance' } | undefined {
  let found: { node: ProbeNode; kind: 'text' | 'instance' } | undefined;
  walk(node, (n) => {
    if (found) return false;
    if (isNumberText(n)) {
      found = { node: n, kind: 'text' };
      return false;
    }
    if (n.type === 'INSTANCE' && texts(n).some((t) => isNumberText(t))) {
      found = { node: n, kind: 'instance' };
      return false;
    }
    return undefined;
  });
  return found;
}

export function pickTitle(node: ProbeNode): ProbeNode | undefined {
  return nonEmptyTexts(node).find((t) => {
    const s = (t.characters ?? '').trim();
    return s.length <= 24 && !isNumberText(t) && !isRoleText(t);
  });
}

export function contentLinesOf(node: ProbeNode, title?: ProbeNode): ProbeNode[] {
  return nonEmptyTexts(node).filter((t) => {
    const s = (t.characters ?? '').trim();
    if (s.length < 4) return false;
    if (isNumberText(t) || isRoleText(t)) return false;
    if (title && t.id === title.id) return false;
    return true;
  });
}

// --- chapter & cluster ---------------------------------------------------

/**
 * Chapter = graphic + text column.
 *
 * The graphic is the widest child whose subtree reaches the image-canvas width
 * (it may bundle the image, the caption and the badge overlay — `rec组` in
 * `1:14` does exactly that). The column is whichever other child holds the most
 * text. No "≥N texts" gate: a chapter with a single short cluster still has a
 * column.
 */
export function pickGraphic(node: ProbeNode): ProbeNode | undefined {
  let best: { node: ProbeNode; width: number } | undefined;
  for (const child of node.children) {
    const width = graphicWidth(child);
    if (width < GRAPHIC_MIN_WIDTH) continue;
    if (!best || width > best.width) best = { node: child, width };
  }
  return best?.node;
}

export function pickColumn(node: ProbeNode, graphic: ProbeNode): ProbeNode | undefined {
  let best: { node: ProbeNode; count: number } | undefined;
  for (const child of node.children) {
    if (child === graphic) continue;
    const count = nonEmptyTexts(child).length;
    if (count < 1) continue;
    if (!best || count > best.count) best = { node: child, count };
  }
  return best?.node;
}

function isClusterish(child: ProbeNode): boolean {
  if (subtreeSize(child) > 400) return false;
  if (nonEmptyTexts(child).length < 2) return false;
  if (findNumberCarrier(child)) return true;
  const title = pickTitle(child);
  return Boolean(title) && contentLinesOf(child, title).length >= 1;
}

function detectChapters(tree: ProbeTree): ChapterInfo[] {
  const candidates = __chapterCandidates(tree);
  // Keep the innermost matches: an ancestor that merely *contains* a chapter
  // is not itself a chapter.
  return candidates.filter(
    (c) => !candidates.some((other) => other !== c && structuredDescendants(c.node).includes(other.node))
  );
}

/** Diagnostic aid for tests: every node that looks like a chapter, pre-filter. */
export function __chapterCandidates(tree: ProbeTree): ChapterInfo[] {
  const candidates: ChapterInfo[] = [];
  walkStructured(tree.root, (node) => {
    if (node.type === 'INSTANCE') return undefined;
    if (node.depth > 12) return false;
    if (node.children.length < 2) return undefined;
    const graphic = pickGraphic(node);
    if (!graphic) return undefined;
    const textZone = pickColumn(node, graphic);
    if (!textZone) return undefined;
    // The picture must be *wider* than the column it sits beside. Without this,
    // a cluster full of copy can pass as its own chapter's graphic.
    const graphicW = graphicWidth(graphic);
    const columnW = textZone.box?.width ?? graphicWidth(textZone);
    if (!(graphicW > columnW * 1.1)) return undefined;
    const clusters = textZone.children.filter(isClusterish);
    if (clusters.length === 0) return undefined;
    candidates.push({ node, graphic, textZone, clusters });
    return undefined;
  });
  return candidates;
}

function buildCluster(node: ProbeNode): ClusterInfo {
  const number = findNumberCarrier(node);
  const title = pickTitle(node);
  return {
    node,
    title,
    number: number?.node,
    numberKind: number?.kind ?? 'none',
    contentLines: contentLinesOf(node, title),
    hiddenTail: structuredDescendants(node).filter((n) => !n.visible).length
  };
}

// --- masters -------------------------------------------------------------

function pickMaster(nodes: ProbeNode[], tree: ProbeTree): MasterRef | undefined {
  if (nodes.length === 0) return undefined;
  const hidden = nodes.find((n) => !n.visible);
  if (hidden) return { nodeId: hidden.id, name: hidden.name, kind: 'hidden' };
  const first = nodes[0]!;
  if (nodes.length >= 2) return { nodeId: first.id, name: first.name, kind: 'repeated' };
  if (tree.root.type === 'COMPONENT') return { nodeId: first.id, name: first.name, kind: 'template' };
  return { nodeId: first.id, name: first.name, kind: 'single' };
}

// --- badges / sub-runs ---------------------------------------------------

/**
 * A child that only carries a number: small subtree, digits-only TEXT.
 *
 * The size test is what keeps an image instance (`Slide 16:9`, 1200×745) from
 * counting as a badge just because its screenshot happens to contain digits.
 */
export function isBadgeNode(node: ProbeNode): boolean {
  if (subtreeSize(node) > 12) return false;
  if ((node.box?.width ?? 0) >= 200 || (node.box?.height ?? 0) >= 200) return false;
  return texts(node).some((t) => isNumberText(t));
}

function detectBadgeGroup(tree: ProbeTree): RepetitionGroup | undefined {
  let found: RepetitionGroup | undefined;
  walkStructured(tree.root, (node) => {
    if (found) return false;
    if (node.children.length < 2) return undefined;
    const badges = node.children.filter(isBadgeNode);
    if (badges.length >= 2) {
      found = { parent: node, members: badges, kind: 'badge' };
      return false;
    }
    return undefined;
  });
  return found;
}

/**
 * Sub-run headings: sibling TEXTs that
 *   - are visible, short (≤24 chars),
 *   - carry a *deliberate* layer name (`#Title`) that differs from their own
 *     characters, and
 *   - share that name with at least one sibling.
 *
 * The name test is what separates `#Title` from hand-typed bullet lines: Figma
 * auto-names a TEXT after its content, so `上架和下架按钮改成蓝色…` has
 * name === characters and is copy, not a heading.
 */
function detectSubrunGroup(tree: ProbeTree, clusterNodes: ProbeNode[]): RepetitionGroup | undefined {
  const insideCluster = new Set<string>();
  for (const cluster of clusterNodes) {
    insideCluster.add(cluster.id);
    for (const d of structuredDescendants(cluster)) insideCluster.add(d.id);
  }
  let best: RepetitionGroup | undefined;
  walkStructured(tree.root, (node) => {
    if (node.children.length < 2) return undefined;
    if (!insideCluster.has(node.id)) return undefined;
    const byName = new Map<string, ProbeNode[]>();
    for (const c of node.children) {
      if (c.type !== 'TEXT' || !c.visible) continue;
      const text = (c.characters ?? '').trim();
      const layerName = c.name.trim();
      if (text === '' || text.length > 24) continue;
      if (text.startsWith('@')) continue;
      if (layerName === '' || layerName === text) continue;
      const list = byName.get(layerName);
      if (list) list.push(c);
      else byName.set(layerName, [c]);
    }
    for (const members of byName.values()) {
      if (members.length < 2) continue;
      if (!best || members.length > best.members.length) {
        best = { parent: node, members, kind: 'subrun' };
      }
    }
    return undefined;
  });
  return best;
}

// --- top / overview / role / figure / column -----------------------------

function detectTop(tree: ProbeTree, chapters: ChapterInfo[]): ProbeNode | undefined {
  const holdsChapter = (node: ProbeNode): boolean =>
    chapters.some((c) => node.id !== c.node.id && structuredDescendants(node).includes(c.node));
  const candidates = [
    tree.root,
    ...tree.root.children,
    ...structuredDescendants(tree.root).filter((n) => n.depth <= 2)
  ].filter((n) => !holdsChapter(n));
  let best: { node: ProbeNode; short: number; size: number } | undefined;
  for (const node of candidates) {
    const shortCount = nonEmptyTexts(node).filter((x) => (x.characters ?? '').trim().length <= 12).length;
    if (shortCount < 2) continue;
    const size = subtreeSize(node);
    // Most labels wins; on a tie the tighter node wins (avoid reporting the
    // whole document as the top area).
    if (!best || shortCount > best.short || (shortCount === best.short && size < best.size)) {
      best = { node, short: shortCount, size };
    }
  }
  return best?.node;
}

/**
 * Overview region: siblings that each hold a short heading + a body paragraph.
 * Nodes that contain or sit inside a chapter are skipped — otherwise every
 * chapter's "graphic + column" pair would read as an overview block.
 */
export function detectOverview(tree: ProbeTree, chapters: ChapterInfo[]): 'two-frames' | 'single-block' | 'none' {
  const chapterIds = new Set(chapters.map((c) => c.node.id));
  const insideChapter = (node: ProbeNode): boolean =>
    chapters.some((c) => c.node === node || structuredDescendants(c.node).includes(node));
  const holdsChapter = (node: ProbeNode): boolean =>
    chapters.some((c) => node.id !== c.node.id && structuredDescendants(node).includes(c.node));

  let best = 0;
  walkStructured(tree.root, (node) => {
    if (node.children.length < 2) return undefined;
    if (insideChapter(node) || holdsChapter(node)) return undefined;
    const boxes = node.children.filter((c) => {
      if (chapterIds.has(c.id)) return false;
      const t = nonEmptyTexts(c);
      if (t.length !== 2) return false;
      if (t.some((x) => isNumberText(x))) return false;
      const lengths = t.map((x) => (x.characters ?? '').trim().length);
      if (lengths.some((l) => l < 2)) return false;
      if (Math.max(...lengths) < 10) return false;
      const w = c.box?.width ?? 0;
      return w >= 200 && graphicWidth(c) < 300;
    });
    if (boxes.length > best) best = boxes.length;
    return undefined;
  });
  if (best >= 2) return 'two-frames';
  // `single-block` is a manual setting: one heading+body pair is far too common
  // (every document-info block looks like that) to read as an overview.
  return 'none';
}

export function detectRoleHabit(tree: ProbeTree): 'component-variant' | 'inline-suffix' | 'none' {
  const byParent = new Map<string, number>();
  let inline = false;
  walkStructured(tree.root, (n) => {
    if (isRoleText(n)) {
      const parentId = n.parent?.id ?? 'root';
      byParent.set(parentId, (byParent.get(parentId) ?? 0) + 1);
    }
    if (hasInlineRoleMention(n)) inline = true;
    return undefined;
  });
  if ([...byParent.values()].some((c) => c >= ROLE_GROUP_MIN)) return 'component-variant';
  return inline ? 'inline-suffix' : 'none';
}

export function detectFigure(clusters: ClusterInfo[]): 'named-group' | 'first-non-text' | 'none' {
  let named = false;
  for (const c of clusters) {
    for (const n of structuredDescendants(c.node)) {
      if (/配图/.test(n.name)) named = true;
    }
  }
  if (named) return 'named-group';
  for (const c of clusters) {
    const mixed = structuredDescendants(c.node).some(
      (n) => n.type !== 'TEXT' && (/image|img_/i.test(n.name) || n.type === 'RECTANGLE')
    );
    if (mixed) return 'first-non-text';
  }
  return 'none';
}

export function detectHiddenPool(clusters: ClusterInfo[]): 'reuse' | 'ignore' | 'absent' {
  const max = clusters.reduce((acc, c) => Math.max(acc, c.hiddenTail), 0);
  if (max >= 3) return 'reuse';
  // No hidden spares reads as the contract default (`ignore`); `absent` is a
  // manual setting for templates that dropped the pool concept entirely.
  return 'ignore';
}

/**
 * Badge placement. Only counts badge parents **inside a chapter's graphic** —
 * a stray group of numbers elsewhere in the document must not decide this.
 * `container` requires every such parent to hold nothing but badges.
 */
export function detectBadgePlacement(
  tree: ProbeTree,
  chapters: ChapterInfo[]
): 'container' | 'manual' | 'none' {
  const parents: ProbeNode[] = [];
  const collect = (root: ProbeNode): void => {
    walkStructured(root, (node) => {
      if (node.children.length < 2) return undefined;
      const badges = node.children.filter(isBadgeNode);
      if (badges.length >= 2) parents.push(node);
      return undefined;
    });
  };
  if (chapters.length > 0) {
    for (const c of chapters) collect(c.graphic);
  } else {
    collect(tree.root);
  }
  if (parents.length === 0) return chapters.some((c) => c.clusters.some((x) => findNumberCarrier(x))) ? 'manual' : 'none';
  const allDedicated = parents.every((p) => p.children.every(isBadgeNode));
  return allDedicated ? 'container' : 'manual';
}

export function detectColumn(chapters: ChapterInfo[]): 'right' | 'bottom' {
  const c = chapters[0];
  if (!c) return 'right';
  const gx = c.graphic.box?.x ?? 0;
  const tx = c.textZone.box?.x ?? 0;
  return tx > gx ? 'right' : 'bottom';
}

/** Sibling-TEXT headings inside a cluster, as a capability signal. */
export function countSubruns(group?: RepetitionGroup): number {
  return group?.members.length ?? 0;
}

export function detect(tree: ProbeTree): DetectionResult {
  const chapters = detectChapters(tree);
  const clusterNodes = chapters.flatMap((c) => c.clusters);
  const clusters = clusterNodes.map(buildCluster);
  return {
    top: detectTop(tree, chapters),
    chapters,
    clusters,
    chapterMaster: pickMaster(chapters.map((c) => c.node), tree),
    clusterMaster: pickMaster(clusterNodes, tree),
    badgeGroup: detectBadgeGroup(tree),
    subrunGroup: detectSubrunGroup(tree, clusterNodes)
  };
}

/** Kept for reports: how the column was found. */
export function describeChapter(c: ChapterInfo): string {
  return `${c.node.name} [${c.node.id}] 图示=${c.graphic.name} 说明=${c.textZone.name} 簇=${c.clusters.length}`;
}

/** Structural signature helper re-exported for pack diffing. */
export { shapeSignature };
