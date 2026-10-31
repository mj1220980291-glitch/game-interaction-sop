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
  /** 模板自带、但 md 没用到配图的空槽：标成 template，不算条目。 */
  looseNodes?: string[];
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
      [TOP_SLOTS.lastUpdate, 'header.lastUpdate']
    ];
    for (const [name, role] of headerRoles) {
      const hit = nodes.find((n) => n.name === name);
      if (hit) slots.push({ nodeId: hit.id, role });
    }
    // 总览标的是**正文 TEXT**（`#Content` / `#Body`），不是外层框：
    // 同步按「上次写入的正文」比对，标到框上会让每次同步都判成设计师手改。
    const overviewRoles: Array<[string, SlotRole]> = [
      [TOP_SLOTS.overviewBackground, 'overview.background'],
      [TOP_SLOTS.overviewCore, 'overview.coreInteraction']
    ];
    for (const [name, role] of overviewRoles) {
      const frame = nodes.find((n) => n.name === name);
      if (!frame) continue;
      const inside = nodes.filter((n) => n.parentId === frame.id && n.type === 'TEXT');
      const body =
        inside.find((n) => n.name === '#Content') ??
        inside.find((n) => n.name === '#Body') ??
        inside[inside.length - 1];
      if (body) slots.push({ nodeId: body.id, role });
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
    // 占位文案是模板残留，不是设计师贴进来的东西。
    const hint = find(CHAPTER_SLOTS.mainImageHint);
    if (hint) slots.push({ nodeId: hint.id, role: 'template' });

    const badgeNodes = bubbleFrame
      ? (await backend.scanSubtree(bubbleFrame.id, 20000)).nodes.filter(
          (n) => n.type === 'FRAME' && isBadgeFrame(n.name)
        )
      : [];
    // 母版是引擎自己的残留物，标成 template 才不会每次同步都被报成"手贴的东西"。
    const master = badgeNodes.find((n) => isBadgeMasterName(n.name));
    if (master) slots.push({ nodeId: master.id, role: 'template' });
    const badges = badgeNodes.filter((n) => n.id !== master?.id);
    const usedBadges = new Set<string>();

    const clusterStamps: ClusterStamp[] = s.clusters.map((cl, ci) => {
      const cid = newId('c');
      const bubble = cl.bubbleId ? { id: cl.bubbleId } : badges[ci];
      if (bubble) {
        slots.push({ nodeId: bubble.id, role: 'bubble', cid });
        usedBadges.add(bubble.id);
      }
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
      for (const id of cl.looseNodes ?? []) slots.push({ nodeId: id, role: 'template' });
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

    // 没用到的标号（模板多带 / 隐藏的）也是引擎残留，标 template 免得被报 foreign。
    for (const b of badges) {
      if (!usedBadges.has(b.id)) slots.push({ nodeId: b.id, role: 'template' });
    }

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

  // 章节外框（`geometry.sectionShell`）：每章外面那几层是结构层，不标就会被
  // 同步当成「人加的节点」。按父级链一路标 template，直到根帧。
  const stamped = new Set(writes.map((w) => w.nodeId));
  for (const s of sections) {
    try {
      let cur = (await backend.getNodeInfo(s.nodeId)).parentId;
      while (cur && cur !== layout.rootId && !stamped.has(cur)) {
        writes.push({ nodeId: cur, stamp: { kind: 'slot', role: 'template' } as Record<string, unknown> });
        stamped.add(cur);
        cur = (await backend.getNodeInfo(cur)).parentId;
      }
    } catch {
      /* 标不上只是少一层结构标记，不影响成图 */
    }
  }

  await backend.stampNodes(writes);
  const written = new Map(writes.map((w) => [w.nodeId, w.stamp] as const));
  return { stamps: writes.length, missing, written };
}

function isBadgeMasterName(name: string): boolean {
  return /母版/.test(name);
}
