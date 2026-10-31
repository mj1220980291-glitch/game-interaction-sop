/**
 * Turn a stamped tree into the structure the planner works on.
 *
 * Every container's sequence is its physical children (in canvas order) plus
 * tombstones: manifest entries whose node is gone, slotted in after their
 * manifest predecessor. A stamped node that no manifest anywhere lists is an
 * orphan of an interrupted sync and is adopted where it stands; one that a
 * *different* container lists, or that repeats an id already seen, is
 * treated as foreign.
 */

import { SOFT_WARNING_CODES, type SoftWarning } from '../ir.js';
import { SECTION_CHILD_NAMES } from '../template-map.js';
import { DEFAULT_LABEL_TEXT_NAME } from '../template-config.js';
import { Tree, type TNode } from './tree.js';
import { profileFor, type StructureProfile } from './structure.js';
import {
  HEADER_KEYS,
  OVERVIEW_KEYS,
  type ClusterStamp,
  type DocStamp,
  type HeaderKey,
  type ItemStamp,
  type ItemType,
  type ManifestEntry,
  type OverviewKey,
  type SectionStamp,
  type SlotRole,
  type SlotStamp
} from './stamp.js';

export interface SnapItem {
  iid: string;
  t: ItemType;
  /** Last written text. */
  W: string;
  node?: TNode;
  stamp?: ItemStamp;
  /** Present but missing from the manifest: the manifest has to be rewritten. */
  orphan?: boolean;
  /** role only: the TEXT inside the 职能标记 instance that holds the body. */
  bodyNode?: TNode;
}

export interface SnapCluster {
  cid: string;
  /** Last written title. */
  W: string;
  node?: TNode;
  stamp?: ClusterStamp;
  orphan?: boolean;
  titleNode?: TNode;
  numberNode?: TNode;
  roleFrame?: TNode;
  bubble?: TNode;
  bubbleNumber?: TNode;
  items: SnapItem[];
  foreign: TNode[];
  /** Node new items go after when nothing precedes them; undefined = front. */
  headAnchorId?: string;
  /**
   * 条目实际挂在哪一层。legacy 是簇节点自身；多部件的条目套在 `Frame 808` 这类
   * 内容层里，插入/移动必须落到这一层，否则锚点在父级里找不到。
   */
  itemsParent?: TNode;
}

export interface SnapSection {
  sid: string;
  W: string;
  node?: TNode;
  stamp?: SectionStamp;
  orphan?: boolean;
  nameNode?: TNode;
  main?: TNode;
  mainStamp?: SlotStamp;
  mainHint?: TNode;
  bubbleFrame?: TNode;
  column?: TNode;
  clusters: SnapCluster[];
  /** Unstamped direct children of the section's containers. */
  foreign: TNode[];
}

export interface DocSnapshot {
  tree: Tree;
  root: TNode;
  stamp: DocStamp;
  profile: StructureProfile;
  header: Partial<Record<HeaderKey, TNode>>;
  overview: Partial<Record<OverviewKey, TNode>>;
  sectionsContainer?: TNode;
  sections: SnapSection[];
  /** Unstamped children of the sections container. */
  foreign: TNode[];
  warnings: SoftWarning[];
}

function slotRole(n: TNode): SlotRole | undefined {
  return n.parsed?.kind === 'slot' ? n.parsed.role : undefined;
}

/**
 * 外壳节点：自己没标记，但里面装着引擎节点。
 *
 * 多部件结构里条目被包在 `Group 1253` / `Frame 808` 这类容器里（`1:14` 是直接
 * 挂在说明块下），把外壳当"设计师手贴的东西"会让它随同步一起被保留、报一堆
 * fake foreign。有下级的引擎内容就说明这层是结构，不是人加的。
 */
function hasStampedDescendant(tree: Tree, node: TNode): boolean {
  return tree.find(node.id, (n) => n.id !== node.id && n.parsed !== undefined) !== undefined;
}

/** 深度优先的子孙节点（文档顺序）。 */
function descendants(tree: Tree, nodeId: string): TNode[] {
  const out: TNode[] = [];
  const walk = (id: string): void => {
    for (const c of tree.children(id)) {
      out.push(c);
      walk(c.id);
    }
  };
  walk(nodeId);
  return out;
}

/** Physical entries + tombstones, in sequence order. */
function mergeWithTombstones<P>(
  present: P[],
  idOf: (p: P) => string,
  manifest: ManifestEntry[],
  makeTombstone: (e: ManifestEntry) => P
): P[] {
  const out = [...present];
  const presentIds = new Set(present.map(idOf));
  manifest.forEach((e, k) => {
    if (presentIds.has(e.id)) return;
    let at = 0;
    for (let back = k - 1; back >= 0; back--) {
      const prevId = manifest[back]!.id;
      const idx = out.findIndex((p) => idOf(p) === prevId);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    out.splice(at, 0, makeTombstone(e));
  });
  return out;
}

export function buildSnapshot(tree: Tree, profile?: StructureProfile): DocSnapshot {
  const root = tree.root;
  const stamp = root.parsed as DocStamp;
  const structure = profile ?? profileFor(stamp);
  const warnings: SoftWarning[] = [];

  // Which container lists which id, across the whole document.
  const owner = new Map<string, string>();
  const claim = (containerKey: string, entries: ManifestEntry[]) => {
    for (const e of entries) owner.set(e.id, containerKey);
  };
  claim('doc', stamp.sections ?? []);
  for (const n of tree.byId.values()) {
    if (n.parsed?.kind === 'section') claim(n.parsed.sid, n.parsed.clusters ?? []);
    if (n.parsed?.kind === 'cluster') claim(n.parsed.cid, n.parsed.items ?? []);
  }
  const seen = new Set<string>();
  /**
   * May `id` live under `containerKey`? `'listed'` when that container's
   * manifest has it, `'orphan'` when no manifest does (left by an interrupted
   * sync), `false` when it belongs elsewhere or repeats an id already seen.
   */
  const accept: Accept = (id, containerKey, n) => {
    if (seen.has(id)) {
      warnings.push({
        code: SOFT_WARNING_CODES.W_DUPLICATE_STAMP,
        message: `node ${n.id} repeats stamp id ${id} (copied by hand?); treated as foreign`,
        context: id
      });
      return false;
    }
    const o = owner.get(id);
    if (o !== undefined && o !== containerKey) return false;
    seen.add(id);
    return o === undefined ? 'orphan' : 'listed';
  };

  const header: DocSnapshot['header'] = {};  const overview: DocSnapshot['overview'] = {};
  for (const n of tree.byId.values()) {
    const r = slotRole(n);
    if (!r) continue;
    for (const k of HEADER_KEYS) if (r === `header.${k}` && !header[k]) header[k] = n;
    for (const k of OVERVIEW_KEYS) if (r === `overview.${k}` && !overview[k]) overview[k] = n;
  }

  const sectionsContainer =
    tree.find(root.id, (n) => slotRole(n) === 'sections') ??
    // 多部件文档没有中间那层容器：`界面说明N` 直接是根帧的子级。
    (structure.id === 'parts' ? root : undefined);
  const foreign: TNode[] = [];
  const presentSections: SnapSection[] = [];
  /**
   * 章节按**标记**收集，不假设「所有章节是容器直属子级」。
   *
   * 多部件渲染按 `sectionShell` 给每章各套一层「章节外框」，章节因此在各自
   * 的壳里。以前只遍历容器直属子级，于是所有章节都被判「设计师删了」——
   * 同步恒为空却报成功。
   */
  const sectionNodes = tree.findAll(root.id, (n) => n.parsed?.kind === 'section');
  const sectionIds = new Set(sectionNodes.map((n) => n.id));
  for (const c of sectionNodes) {
    const s = c.parsed as SectionStamp;
    const ok = accept(s.sid, 'doc', c);
    if (ok) {
      presentSections.push({ ...snapSection(tree, c, s, accept, structure), orphan: ok === 'orphan' });
    }
  }
  for (const c of sectionsContainer ? tree.children(sectionsContainer.id) : []) {
    if (sectionIds.has(c.id)) continue;
    // 结构层（章节外框）：子树里有章节就不是「人加的」，不进 foreign。
    if (tree.find(c.id, (n) => n.id !== c.id && sectionIds.has(n.id))) continue;
    const s = c.parsed;
    if (!s || s.kind === 'section') foreign.push(c);
  }
  const sections = mergeWithTombstones(
    presentSections,
    (s) => s.sid,
    stamp.sections ?? [],
    (e) => ({ sid: e.id, W: e.text, clusters: [], foreign: [] })
  );

  return { tree, root, stamp, profile: structure, header, overview, sectionsContainer, sections, foreign, warnings };
}

type Accept = (id: string, containerKey: string, n: TNode) => 'listed' | 'orphan' | false;

function snapSection(
  tree: Tree,
  node: TNode,
  stamp: SectionStamp,
  accept: Accept,
  profile: StructureProfile
): SnapSection {
  const byRole = (role: SlotRole) => tree.find(node.id, (n) => slotRole(n) === role);
  const main = byRole('main');
  const mainHint = byRole('mainHint');
  const bubbleFrame = byRole('bubbleFrame');
  const column = byRole('column');

  const clustersPresent: SnapCluster[] = [];
  const foreign: TNode[] = [];
  if (column) {
    for (const c of tree.children(column.id)) {
      const s = c.parsed;
      const ok = s?.kind === 'cluster' ? accept(s.cid, stamp.sid, c) : false;
      if (s?.kind === 'cluster' && ok) {
        clustersPresent.push({ ...snapCluster(tree, c, s, accept, profile), orphan: ok === 'orphan' });
      } else if (!s || s.kind === 'cluster') {
        foreign.push(c);
      }
    }
  }
  const bubbles = new Map<string, TNode>();
  if (bubbleFrame) {
    for (const b of tree.children(bubbleFrame.id)) {
      if (b.parsed?.kind === 'slot' && b.parsed.role === 'bubble' && b.parsed.cid) {
        if (!bubbles.has(b.parsed.cid)) bubbles.set(b.parsed.cid, b);
      } else if (!b.parsed) {
        foreign.push(b);
      }
    }
  }
  for (const cl of clustersPresent) {
    const b = bubbles.get(cl.cid);
    if (b) {
      cl.bubble = b;
      cl.bubbleNumber =
        tree.find(b.id, (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.bubbleNumberText) ??
        tree.find(b.id, (n) => n.type === 'TEXT');
    }
  }

  // Unstamped direct children of the section and of whatever holds its main image.
  const watch = new Set<string>([node.id]);
  for (const part of [main, mainHint, bubbleFrame]) {
    if (part?.parentId && part.parentId !== node.id && tree.isDescendantOf(part.parentId, node.id)) {
      watch.add(part.parentId);
    }
  }
  for (const w of watch) {
    for (const c of tree.children(w)) {
      if (!c.parsed && !hasStampedDescendant(tree, c)) foreign.push(c);
    }
  }

  return {
    sid: stamp.sid,
    W: stamp.name,
    node,
    stamp,
    nameNode: byRole('section.name'),
    main,
    mainStamp: main?.parsed?.kind === 'slot' ? main.parsed : undefined,
    mainHint,
    bubbleFrame,
    column,
    clusters: mergeWithTombstones(
      clustersPresent,
      (c) => c.cid,
      stamp.clusters ?? [],
      (e) => ({ cid: e.id, W: e.text, items: [], foreign: [] })
    ),
    foreign
  };
}

function snapCluster(
  tree: Tree,
  node: TNode,
  stamp: ClusterStamp,
  accept: Accept,
  profile: StructureProfile
): SnapCluster {
  const byRole = (role: SlotRole) => tree.find(node.id, (n) => slotRole(n) === role);
  const present: SnapItem[] = [];
  const foreign: TNode[] = [];
  let headAnchorId: string | undefined;
  let lastStructural: string | undefined;
  // 多部件文档的条目套在 `Group 1253` / `Frame 808` 里，不在簇根节点的直接子级；
  // legacy 的说明块是扁平结构，两种都按文档顺序遍历一遍即可。
  const candidates =
    profile.id === 'parts'
      ? descendants(tree, node.id).filter((n) => n.parsed?.kind === 'item')
      : tree.children(node.id);
  for (const c of candidates) {
    const s = c.parsed;
    const ok = s?.kind === 'item' ? accept(s.iid, stamp.cid, c) : false;
    if (s?.kind === 'item' && ok) {
      if (present.length === 0) headAnchorId = lastStructural;
      present.push({
        iid: s.iid,
        t: s.t,
        W: s.text,
        node: c,
        stamp: s,
        orphan: ok === 'orphan',
        ...(s.t === 'role' ? { bodyNode: roleBodyNode(tree, c) } : {})
      });
    } else if (s && s.kind === 'slot') {
      lastStructural = c.id;
    } else if (!hasStampedDescendant(tree, c)) {
      foreign.push(c);
    }
  }
  if (present.length === 0) headAnchorId = lastStructural;

  // 多部件的条目套在 `Frame 808` 这类内容层里：插入与移动要落到这一层，
  // 否则锚点在簇根节点的子级里找不到。
  const itemsParent =
    profile.id === 'parts' && present[0]?.node?.parentId
      ? tree.byId.get(present[0].node.parentId)
      : undefined;

  return {
    cid: stamp.cid,
    W: stamp.title,
    node,
    stamp,
    titleNode: byRole('clusterTitle'),
    numberNode: byRole('clusterNumber'),
    roleFrame: tree.children(node.id).find((c) => slotRole(c) === 'roles'),
    items: mergeWithTombstones(
      present,
      (it) => it.iid,
      stamp.items ?? [],
      (e) => ({ iid: e.id, t: (e as { t?: ItemType }).t ?? 'rule', W: e.text })
    ),
    foreign,
    headAnchorId,
    ...(itemsParent ? { itemsParent } : {})
  };
}

/**
 * Body TEXT of a 职能标记 instance: the first TEXT that is not the variant
 * label, else the first TEXT it has.
 */
function roleBodyNode(tree: Tree, instance: TNode): TNode | undefined {
  return tree.find(
    instance.id,
    (n) => n.type === 'TEXT' && n.name !== DEFAULT_LABEL_TEXT_NAME
  ) ?? tree.find(instance.id, (n) => n.type === 'TEXT');
}

export function roleTexts(tree: Tree, roleFrame: TNode): string[] {
  return tree
    .children(roleFrame.id)
    .filter((c) => c.type === 'TEXT')
    .map((c) => c.characters ?? '');
}
