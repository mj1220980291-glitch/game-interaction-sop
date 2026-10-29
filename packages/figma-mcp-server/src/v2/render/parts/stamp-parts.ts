/**
 * 给多部件渲染出来的文档打标记。
 *
 * 标记种类与 `1:14` 路径完全一致（`doc` / `section` / `cluster` / `item` / `slot`），
 * 这样同步的规划器不用关心节点原来叫什么——差别只在挂载位置：
 *
 *   section  → `界面说明N` 根帧
 *   cluster  → 簇实例根帧（挂在说明栏里）
 *   item     → `正文/规则` TEXT、`配图` RECTANGLE（单层，没有外层 GROUP）
 *   slot     → 说明栏（sections）/ `#Title_Main`（section.name）/ 主图（main）
 *              / 气泡（bubbleFrame）/ 标号（bubble）/ 模板残留（template）
 *
 * `text` 一律读回节点上的实际文字：那才是「上次写入的值」，拿 markdown 原文
 * 会跟渲染期的规范化（职能后缀、加粗标记）对不上。
 *
 * Spec: openspec/changes/parts-doc-reconcile-sync (D3)
 */

import type { FigmaBackend, NodeInfo } from '../../figma-client.js';
import type { DocIR } from '../../ir.js';
import type { TemplatePack } from '../../template/schema.js';
import { CHAPTER_SLOTS, CLUSTER_SLOTS, TOP_SLOTS, isBadgeFrame } from '../../template-slots.js';
import { packComponents, packHash } from '../../template/pack-hash.js';
import {
  newId,
  type ClusterStamp,
  type DocStamp,
  type ItemType,
  type SectionStamp,
  type SlotRole
} from '../../reconcile/stamp.js';

export interface PartsItemLayout {
  nodeId: string;
  t: ItemType;
  /** What the node says right now (bullets) or the figure description. */
  text: string;
}

export interface PartsClusterLayout {
  nodeId: string;
  title: string;
  roles: string[];
  items: PartsItemLayout[];
  /** `标号/N` clone that points at this cluster. */
  bubbleId?: string;
}

export interface PartsSectionLayout {
  nodeId: string;
  name: string;
  clusters: PartsClusterLayout[];
}

export interface PartsDocLayout {
  rootId: string;
  /** 顶部部件：里面的头部槽位要按 `header.*` 打标，否则头部同步不了。 */
  topNodeId?: string;
  footerNodeId?: string;
  sections: PartsSectionLayout[];
}

/** Effective visibility: a node inside a hidden ancestor is hidden too. */
export function visibleIds(nodes: NodeInfo[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  for (const n of nodes) {
    let cur: NodeInfo | undefined = n;
    let ok = true;
    while (cur) {
      if (cur.visible === false) {
        ok = false;
        break;
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (ok && n.visible !== false) out.add(n.id);
  }
  return out;
}

/** 条目：簇子树里按文档顺序排列的规则 / 配图节点（跳过隐藏备用池）。 */
export function clusterItems(nodes: NodeInfo[], clusterId: string): Array<{ id: string; t: ItemType }> {
  const visible = visibleIds(nodes);
  return nodes
    .filter((n) => n.id !== clusterId && visible.has(n.id))
    .filter((n) => n.name === CLUSTER_SLOTS.bullet || n.name === CLUSTER_SLOTS.figure)
    .map((n) => ({
      id: n.id,
      t: (n.name === CLUSTER_SLOTS.figure ? 'figure' : 'rule') as ItemType
    }));
}

export async function stampPartsDoc(
  backend: FigmaBackend,
  layout: PartsDocLayout,
  ir: DocIR,
  pack: TemplatePack
): Promise<{
  stamps: number;
  missing: string[];
  /** nodeId → the stamp actually written (sync 需要它拿 scratch 条目的 iid)。 */
  written: Map<string, Record<string, unknown>>;
}> {
  if (!backend.stampNodes) {
    return { stamps: 0, missing: ['backend cannot write stamps'], written: new Map() };
  }

  const missing: string[] = [];
  const slots: Array<{ nodeId: string; role: SlotRole; cid?: string }> = [];
  const sections: Array<{ nodeId: string; stamp: SectionStamp }> = [];
  const writeItems: Array<{ nodeId: string; stamp: Record<string, unknown>; captureHash?: boolean }> = [];
  const clusterWrites: Array<{ nodeId: string; stamp: Record<string, unknown> }> = [];

  if (layout.topNodeId) {
    const { nodes } = await backend.scanSubtree(layout.topNodeId, 20000);
    const headerRoles: Array<[string, SlotRole]> = [
      [TOP_SLOTS.docTitle, 'header.title'],
      [TOP_SLOTS.owner, 'header.owner'],
      [TOP_SLOTS.group, 'header.group'],
      [TOP_SLOTS.ticketLink, 'header.ticketLink'],
      [TOP_SLOTS.lastUpdate, 'header.lastUpdate'],
      [TOP_SLOTS.overviewBackground, 'overview.background'],
      [TOP_SLOTS.overviewCore, 'overview.coreInteraction']
    ];
    for (const [name, role] of headerRoles) {
      const hit = nodes.find((n) => n.name === name);
      if (hit) slots.push({ nodeId: hit.id, role });
    }
    slots.push({ nodeId: layout.topNodeId, role: 'template' });
  }
  if (layout.footerNodeId) slots.push({ nodeId: layout.footerNodeId, role: 'template' });

  for (const s of layout.sections) {
    const { nodes } = await backend.scanSubtree(s.nodeId, 20000);
    const find = (name: string): NodeInfo | undefined => nodes.find((n) => n.name === name);

    const column = find(CHAPTER_SLOTS.clusterHost);
    const title = find(CHAPTER_SLOTS.sectionTitle);
    const main = find(CHAPTER_SLOTS.mainImage);
    const bubbleFrame = find(CHAPTER_SLOTS.badgeContainer);
    if (column) slots.push({ nodeId: column.id, role: 'column' });
    if (title) slots.push({ nodeId: title.id, role: 'section.name' });
    if (main) slots.push({ nodeId: main.id, role: 'main' });
    if (bubbleFrame) slots.push({ nodeId: bubbleFrame.id, role: 'bubbleFrame' });
    for (const [name, role] of [
      [CHAPTER_SLOTS.clusterHost, 'column'],
      [CHAPTER_SLOTS.sectionTitle, 'section.name'],
      [CHAPTER_SLOTS.mainImage, 'main'],
      [CHAPTER_SLOTS.badgeContainer, 'bubbleFrame']
    ] as const) {
      if (!find(name)) missing.push(`${role}@${s.name}`);
    }

    const badgeNodes = bubbleFrame
      ? (await backend.scanSubtree(bubbleFrame.id, 20000)).nodes.filter(
          (n) => n.type === 'FRAME' && isBadgeFrame(n.name)
        )
      : [];
    // 母版是引擎自己的残留物，标成 template 才不会每次同步都被报成"手贴的东西"。
    const master = badgeNodes.find((n) => isBadgeMasterName(n.name));
    if (master) slots.push({ nodeId: master.id, role: 'template' });
    const badges = badgeNodes.filter((n) => n.id !== master?.id);

    const clusterStamps: ClusterStamp[] = s.clusters.map((cl, ci) => {
      const cid = newId('c');
      const bubble = cl.bubbleId ? { id: cl.bubbleId } : badges[ci];
      if (bubble) slots.push({ nodeId: bubble.id, role: 'bubble', cid });
      // 清单里记的是条目自己的 iid，不是节点 id：快照按 stamp id 归属，
      // 记错会让引擎把自己的节点当成「设计师删掉了」。
      const entries = cl.items.map((it) => {
        const iid = newId('i');
        writeItems.push({
          nodeId: it.nodeId,
          stamp: { kind: 'item', iid, t: it.t, text: it.text },
          // 配图要记下这次写入的图片哈希：下次同步靠它区分「md 换了图」与
          // 「设计师自己换了图」，没有哈希一律算冲突。
          ...(it.t === 'figure' ? { captureHash: true } : {})
        });
        return { id: iid, t: it.t, text: it.text };
      });
      clusterWrites.push({
        nodeId: cl.nodeId,
        stamp: {
          kind: 'cluster',
          cid,
          title: cl.title,
          roles: cl.roles,
          items: entries
        } as unknown as Record<string, unknown>
      });
      return { kind: 'cluster', cid, title: cl.title, roles: cl.roles, items: entries };
    });

    sections.push({
      nodeId: s.nodeId,
      stamp: {
        kind: 'section',
        sid: newId('s'),
        name: s.name,
        clusters: clusterStamps.map((c) => ({ id: c.cid, text: c.title }))
      }
    });
  }

  const doc: DocStamp = {
    kind: 'doc',
    v: 1,
    header: {
      title: ir.header.title,
      owner: ir.header.owner,
      group: ir.header.group,
      ticketLink: ir.header.ticketLink,
      lastUpdate: ir.header.lastUpdate
    },
    overview: {
      background: ir.overview.background,
      coreInteraction: ir.overview.coreInteraction
    },
    sections: sections.map((s) => ({ id: s.stamp.sid, text: s.stamp.name })),
    structure: 'parts',
    parts: { structure: 'parts', packHash: packHash(pack), components: packComponents(pack) }
  };

  const writes = [
    { nodeId: layout.rootId, stamp: doc as unknown as Record<string, unknown> },
    ...sections.map((s) => ({ nodeId: s.nodeId, stamp: s.stamp as unknown as Record<string, unknown> })),
    ...clusterWrites,
    ...writeItems,
    ...slots.map((s) => ({
      nodeId: s.nodeId,
      stamp: { kind: 'slot', role: s.role, ...(s.cid ? { cid: s.cid } : {}) } as Record<string, unknown>
    }))
  ];

  await backend.stampNodes(writes);
  const written = new Map(writes.map((w) => [w.nodeId, w.stamp] as const));
  return { stamps: writes.length, missing, written };
}

function isBadgeMasterName(name: string): boolean {
  return /母版/.test(name);
}
