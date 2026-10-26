/**
 * Map a freshly rendered document back onto its IR, by position.
 *
 * Right after a create-mode render the canvas is exactly what the renderer
 * built: sections in IR order, one 说明块 per cluster, and inside each block
 * the 正文/规则 · 配图 · #Title children in document order. So a single read
 * of the tree is enough to know which node holds which markdown line, and to
 * stamp them all in one batch at the end — without threading node ids through
 * every fill function.
 */

import type { DocIR, SemanticCluster } from '../ir.js';
import type { AssetSpec } from '../render.js';
import type { FigmaBackend, StampEntry } from '../figma-client.js';
import { SECTION_CHILD_NAMES } from '../template-map.js';
import { DEFAULT_VARIANT_PREFIX } from '../template-config.js';
import { parseRoleBullet } from '../role-block.js';
import { Tree, type TNode } from './tree.js';
import {
  HEADER_KEYS,
  OVERVIEW_KEYS,
  STAMP_VERSION,
  isImageBullet,
  newId,
  normalizeBulletText,
  stripImageBulletPrefix,
  stripIndexPrefix,
  type ClusterStamp,
  type DocStamp,
  type HeaderKey,
  type ItemStamp,
  type ItemType,
  type OverviewKey,
  type SectionStamp,
  type SlotStamp
} from './stamp.js';

export interface ExpectedItem {
  t: ItemType;
  /** The exact characters the renderer writes (figure: the description). */
  text: string;
  /** figure only: K in the `"NN/C/K"` asset key. */
  ordinal?: number;
  /** role only: the 职能 the component variant is chosen by. */
  role?: string;
}

/** A cluster's items in document order, as the renderer lays them out. */
export function expectedItems(cluster: SemanticCluster): ExpectedItem[] {
  const flat =
    cluster.groups.length <= 1 && (cluster.groups[0]?.title ?? null) === null;
  const out: ExpectedItem[] = [];
  let ordinal = 0;
  for (const g of cluster.groups) {
    if (!flat && g.title !== null) out.push({ t: 'subtitle', text: g.title });
    for (const b of g.bullets) {
      const role = parseRoleBullet(b);
      if (role) {
        out.push({ t: 'role', text: role.text, role: role.role });
      } else if (isImageBullet(b)) {
        out.push({ t: 'figure', text: stripImageBulletPrefix(b), ordinal: ++ordinal });
      } else {
        out.push({ t: 'rule', text: normalizeBulletText(b) });
      }
    }
  }
  return out;
}

export const HEADER_NODE_NAMES: Record<HeaderKey, string> = {
  title: '文档标题',
  owner: '设计师名称',
  group: '需求组名称',
  ticketLink: '易协作单号链接',
  lastUpdate: '更新时间'
};

const OVERVIEW_FRAME_NAMES: Record<OverviewKey, string> = {
  background: '功能背景',
  coreInteraction: '核心交互'
};

export interface ItemLayout {
  nodeId: string;
  t: ItemType;
}

export interface ClusterLayout {
  blockId: string;
  headerId?: string;
  titleId?: string;
  numberId?: string;
  roleFrameId?: string;
  bubbleId?: string;
  items: ItemLayout[];
}

export interface SectionLayout {
  nodeId: string;
  nameId?: string;
  mainId?: string;
  mainHintId?: string;
  bubbleFrameId?: string;
  columnId?: string;
  clusters: ClusterLayout[];
}

export interface DocLayout {
  rootId: string;
  header: Partial<Record<HeaderKey, string>>;
  overview: Partial<Record<OverviewKey, string>>;
  sectionsContainerId?: string;
  sections: SectionLayout[];
}

const isText = (name: string) => (n: TNode) => n.type === 'TEXT' && n.name === name;

export function itemTypeOf(n: TNode): ItemType | undefined {
  if (n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterBulletText) return 'rule';
  if (n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterSubTitle) return 'subtitle';
  if (n.type === 'GROUP' && n.name === SECTION_CHILD_NAMES.optionalImagePlaceholder) return 'figure';
  if (n.type === 'INSTANCE' && n.name.startsWith(DEFAULT_VARIANT_PREFIX)) return 'role';
  return undefined;
}

export function isRoleFrame(n: TNode): boolean {
  return n.type === 'FRAME' && n.name.startsWith(SECTION_CHILD_NAMES.roleTagsFramePrefix);
}

/** The body TEXT of an overview frame — same rule as the renderer's fillOverviewBody. */
function overviewBody(tree: Tree, frame: TNode): TNode | undefined {
  const texts = tree.children(frame.id).filter((c) => c.type === 'TEXT');
  return (
    texts.find((c) => c.name === '#Content') ??
    texts.find((c) => c.name === '#Body') ??
    texts[texts.length - 1]
  );
}

export interface MapLayoutResult {
  layout: DocLayout;
  /** Places where the canvas did not line up with the IR. Those parts stay unstamped. */
  problems: string[];
}

export function mapLayout(tree: Tree, ir: DocIR): MapLayoutResult {
  const problems: string[] = [];
  const rootId = tree.rootId;

  const header: DocLayout['header'] = {};
  for (const k of HEADER_KEYS) {
    const n = tree.find(rootId, isText(HEADER_NODE_NAMES[k]));
    if (n) header[k] = n.id;
  }
  const overview: DocLayout['overview'] = {};
  for (const k of OVERVIEW_KEYS) {
    const frame = tree.find(rootId, (n) => n.name === OVERVIEW_FRAME_NAMES[k] && n.type !== 'TEXT');
    const body = frame ? overviewBody(tree, frame) : undefined;
    if (body) overview[k] = body.id;
  }

  const firstSection = tree.find(rootId, (n) => n.id !== rootId && n.name.startsWith('界面说明'));
  const containerId = firstSection?.parentId;
  const sectionNodes = containerId
    ? tree.children(containerId).filter((n) => n.name.startsWith('界面说明'))
    : [];
  if (sectionNodes.length !== ir.sections.length) {
    problems.push(`sections: canvas has ${sectionNodes.length}, markdown has ${ir.sections.length}`);
  }

  const sections: SectionLayout[] = [];
  ir.sections.forEach((section, si) => {
    const node = sectionNodes[si];
    if (!node) return;
    const column = tree.find(
      node.id,
      (n) => n.type === 'FRAME' && n.name === SECTION_CHILD_NAMES.rightColumnContainer
    );
    const bubbleFrame = tree.find(
      node.id,
      (n) => n.type === 'FRAME' && n.name === SECTION_CHILD_NAMES.bubbleOverlayFrame
    );
    const blocks = column
      ? tree.children(column.id).filter((n) => n.name.startsWith(SECTION_CHILD_NAMES.clusterBlockPrefix))
      : [];
    const bubbles = bubbleFrame
      ? tree.children(bubbleFrame.id).filter((n) => n.name.startsWith(SECTION_CHILD_NAMES.bubbleNumberPrefix))
      : [];
    if (blocks.length !== section.clusters.length) {
      problems.push(`${section.index}: canvas has ${blocks.length} 说明块, markdown has ${section.clusters.length} clusters`);
    }

    const clusters: ClusterLayout[] = [];
    section.clusters.forEach((cluster, ci) => {
      const block = blocks[ci];
      if (!block) return;
      const direct = tree.children(block.id);
      const items: ItemLayout[] = [];
      for (const c of direct) {
        const t = itemTypeOf(c);
        if (t) items.push({ nodeId: c.id, t });
      }
      const want = expectedItems(cluster);
      const lined =
        items.length === want.length && items.every((it, k) => it.t === want[k]!.t);
      if (!lined) {
        problems.push(
          `${section.index}/${ci + 1}: canvas items [${items.map((i) => i.t).join(',')}] ≠ markdown [${want.map((i) => i.t).join(',')}]`
        );
      }
      clusters.push({
        blockId: block.id,
        headerId: direct.find((c) => c.type === 'GROUP' && c.name === '标题')?.id,
        titleId: tree.find(block.id, isText(SECTION_CHILD_NAMES.clusterTitle))?.id,
        numberId: tree.find(block.id, isText(SECTION_CHILD_NAMES.clusterNumberText))?.id,
        roleFrameId: direct.find(isRoleFrame)?.id,
        bubbleId: section.isGlobalSpec ? undefined : bubbles[ci]?.id,
        items: lined ? items : []
      });
    });

    sections.push({
      nodeId: node.id,
      nameId: tree.find(node.id, isText(SECTION_CHILD_NAMES.interfaceNameLabel))?.id,
      mainId: tree.find(node.id, (n) => n.name === SECTION_CHILD_NAMES.mainImagePlaceholder)?.id,
      mainHintId: tree.find(node.id, isText(SECTION_CHILD_NAMES.mainImagePlaceholderHint))?.id,
      bubbleFrameId: bubbleFrame?.id,
      columnId: column?.id,
      clusters
    });
  });

  return {
    layout: { rootId, header, overview, sectionsContainerId: containerId, sections },
    problems
  };
}

/**
 * Stamps for a freshly rendered document. Every engine-built node gets one;
 * every other direct child of a container the reconciler inspects gets a
 * `template` slot stamp, so that "unstamped" later means "added by a person".
 */
export function buildCreateStamps(
  tree: Tree,
  layout: DocLayout,
  ir: DocIR,
  assetMap: Record<string, AssetSpec> | undefined
): StampEntry[] {
  const out = new Map<string, StampEntry>();
  const put = (nodeId: string | undefined, stamp: object, captureHash = false) => {
    if (!nodeId) return;
    out.set(nodeId, {
      nodeId,
      stamp: stamp as Record<string, unknown>,
      ...(captureHash ? { captureHash: true } : {})
    });
  };
  const slot = (nodeId: string | undefined, s: Omit<SlotStamp, 'kind'>, captureHash = false) =>
    put(nodeId, { kind: 'slot', ...s }, captureHash);
  const residue = (containerId: string | undefined) => {
    if (!containerId) return;
    for (const c of tree.children(containerId)) {
      if (!out.has(c.id)) slot(c.id, { role: 'template' });
    }
  };

  const doc: DocStamp = {
    kind: 'doc',
    v: STAMP_VERSION,
    header: {},
    overview: {},
    sections: []
  };
  for (const k of HEADER_KEYS) {
    if (layout.header[k]) {
      doc.header[k] = ir.header[k];
      slot(layout.header[k], { role: `header.${k}` });
    }
  }
  for (const k of OVERVIEW_KEYS) {
    if (layout.overview[k]) {
      doc.overview[k] = ir.overview[k];
      slot(layout.overview[k], { role: `overview.${k}` });
    }
  }
  slot(layout.sectionsContainerId, { role: 'sections' });

  layout.sections.forEach((sl, si) => {
    const section = ir.sections[si]!;
    const sec: SectionStamp = {
      kind: 'section',
      sid: newId('s'),
      name: stripIndexPrefix(section.name),
      clusters: []
    };
    doc.sections.push({ id: sec.sid, text: sec.name });

    slot(sl.nameId, { role: 'section.name' });
    if (!section.isGlobalSpec) {
      const asset = assetMap?.[section.index];
      slot(
        sl.mainId,
        { role: 'main', ...(asset && asset.type !== 'skip' ? { asset } : {}) },
        true
      );
      slot(sl.mainHintId, { role: 'mainHint' });
      slot(sl.bubbleFrameId, { role: 'bubbleFrame' });
    }
    slot(sl.columnId, { role: 'column' });

    sl.clusters.forEach((cl, ci) => {
      const cluster = section.clusters[ci]!;
      const cs: ClusterStamp = {
        kind: 'cluster',
        cid: newId('c'),
        title: stripIndexPrefix(cluster.title),
        roles: [...cluster.roles],
        items: []
      };
      sec.clusters.push({ id: cs.cid, text: cs.title });

      slot(cl.headerId, { role: 'clusterHeader' });
      slot(cl.titleId, { role: 'clusterTitle' });
      slot(cl.numberId, { role: 'clusterNumber' });
      slot(cl.roleFrameId, { role: 'roles' });
      slot(cl.bubbleId, { role: 'bubble', cid: cs.cid });

      const want = expectedItems(cluster);
      cl.items.forEach((it, k) => {
        const exp = want[k]!;
        const item: ItemStamp = {
          kind: 'item',
          iid: newId('i'),
          t: exp.t,
          text: exp.text,
          ...(exp.role ? { role: exp.role } : {})
        };
        let capture = false;
        if (exp.t === 'figure') {
          const asset = assetMap?.[`${section.index}/${ci + 1}/${exp.ordinal}`];
          if (asset?.type === 'figma_node') item.asset = asset;
          capture = true;
        }
        cs.items.push({ id: item.iid, t: item.t, text: item.text });
        put(it.nodeId, item, capture);
      });

      put(cl.blockId, cs);
      residue(cl.blockId);
    });

    put(sl.nodeId, sec);
    residue(sl.nodeId);
    const mainParent = sl.mainId ? tree.get(sl.mainId)?.parentId : undefined;
    if (mainParent && mainParent !== sl.nodeId && tree.isDescendantOf(mainParent, sl.nodeId)) {
      residue(mainParent);
    }
    residue(sl.bubbleFrameId);
    residue(sl.columnId);
  });

  residue(layout.sectionsContainerId);
  put(layout.rootId, doc);
  return [...out.values()];
}

export interface StampedDoc {
  layout: DocLayout;
  /** Stamp written on each node, by node id. */
  stamps: Map<string, Record<string, unknown>>;
  problems: string[];
}

/** Read a freshly rendered doc, map it to the IR and stamp it — two backend calls. */
export async function stampRenderedDoc(
  backend: FigmaBackend,
  rootId: string,
  ir: DocIR,
  assetMap: Record<string, AssetSpec> | undefined
): Promise<StampedDoc> {
  if (!backend.readStampedTree || !backend.stampNodes) {
    throw new Error('backend lacks readStampedTree / stampNodes');
  }
  const tree = new Tree(await backend.readStampedTree(rootId), rootId);
  const { layout, problems } = mapLayout(tree, ir);
  const entries = buildCreateStamps(tree, layout, ir, assetMap);
  await backend.stampNodes(entries);
  const stamps = new Map<string, Record<string, unknown>>();
  for (const e of entries) if (e.stamp) stamps.set(e.nodeId, e.stamp);
  return { layout, stamps, problems };
}
