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
import { Tree, type TNode } from './tree.js';
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

export function buildSnapshot(tree: Tree): DocSnapshot {
  const root = tree.root;
  const stamp = root.parsed as DocStamp;
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

  const header: DocSnapshot['header'] = {};
  const overview: DocSnapshot['overview'] = {};
  for (const n of tree.byId.values()) {
    const r = slotRole(n);
    if (!r) continue;
    for (const k of HEADER_KEYS) if (r === `header.${k}` && !header[k]) header[k] = n;
    for (const k of OVERVIEW_KEYS) if (r === `overview.${k}` && !overview[k]) overview[k] = n;
  }

  const sectionsContainer = tree.find(root.id, (n) => slotRole(n) === 'sections');
  const foreign: TNode[] = [];
  const presentSections: SnapSection[] = [];
  for (const c of sectionsContainer ? tree.children(sectionsContainer.id) : []) {
    const s = c.parsed;
    const ok = s?.kind === 'section' ? accept(s.sid, 'doc', c) : false;
    if (s?.kind === 'section' && ok) {
      presentSections.push({ ...snapSection(tree, c, s, accept), orphan: ok === 'orphan' });
    } else if (!s || s.kind === 'section') {
      foreign.push(c);
    }
  }
  const sections = mergeWithTombstones(
    presentSections,
    (s) => s.sid,
    stamp.sections ?? [],
    (e) => ({ sid: e.id, W: e.text, clusters: [], foreign: [] })
  );

  return { tree, root, stamp, header, overview, sectionsContainer, sections, foreign, warnings };
}

type Accept = (id: string, containerKey: string, n: TNode) => 'listed' | 'orphan' | false;

function snapSection(tree: Tree, node: TNode, stamp: SectionStamp, accept: Accept): SnapSection {
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
        clustersPresent.push({ ...snapCluster(tree, c, s, accept), orphan: ok === 'orphan' });
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
  for (const w of watch) for (const c of tree.children(w)) if (!c.parsed) foreign.push(c);

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

function snapCluster(tree: Tree, node: TNode, stamp: ClusterStamp, accept: Accept): SnapCluster {
  const byRole = (role: SlotRole) => tree.find(node.id, (n) => slotRole(n) === role);
  const present: SnapItem[] = [];
  const foreign: TNode[] = [];
  let headAnchorId: string | undefined;
  let lastStructural: string | undefined;
  for (const c of tree.children(node.id)) {
    const s = c.parsed;
    const ok = s?.kind === 'item' ? accept(s.iid, stamp.cid, c) : false;
    if (s?.kind === 'item' && ok) {
      if (present.length === 0) headAnchorId = lastStructural;
      present.push({ iid: s.iid, t: s.t, W: s.text, node: c, stamp: s, orphan: ok === 'orphan' });
    } else if (s && s.kind === 'slot') {
      lastStructural = c.id;
    } else {
      foreign.push(c);
    }
  }
  if (present.length === 0) headAnchorId = lastStructural;

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
    headAnchorId
  };
}

export function roleTexts(tree: Tree, roleFrame: TNode): string[] {
  return tree
    .children(roleFrame.id)
    .filter((c) => c.type === 'TEXT')
    .map((c) => c.characters ?? '');
}
