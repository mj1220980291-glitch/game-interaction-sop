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

import type { FigmaBackend } from '../figma-client.js';import {
  BADGE_MASTER_NAME,
  CHAPTER_SLOTS,
  CLUSTER_SLOTS,
  OVERVIEW_TEXT_SLOTS,
  TOP_SLOTS,
  type PartName
} from '../template-slots.js';
import type { Capabilities } from '../template/schema.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';
import { trace } from './trace.js';

const SCAN_BUDGET = 20000;

export interface SlimInput {
  backend: FigmaBackend;
  parts: ReadonlyArray<{ part: PartName; nodeId: string }>;
  /** 产物能力：顶部清残留只在「没有总览区」时做（总览区的标题文本要留着）。 */
  capabilities?: Pick<Capabilities, 'overview'>;
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
      deleted += await slimCluster(backend, nodeId, gaps);
    } else if (part === 'top' && input.capabilities?.overview === 'none') {
      cleared += await slimTop(backend, nodeId);
    }
  }

  return { deleted, cleared, gaps };
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
  const stale = nodes.filter(
    (n) =>
      n.type === 'TEXT' &&
      n.visible !== false &&
      !isSublayer(n.id) &&
      (n.characters ?? '').trim() !== '' &&
      !keep.has(n.name)
  );
  if (stale.length === 0) return 0;
  if (typeof backend.setMultipleTextContents !== 'function') return 0;
  const t0 = Date.now();
  await backend.setMultipleTextContents(stale.map((n) => ({ nodeId: n.id, characters: '' })));
  trace(`slimTop cleared=${stale.length} ${Date.now() - t0}ms`);
  return stale.length;
}

/**
 * 实例子层：id 形如 `I123;456`（Figma 用 `;` 串起祖先 id）。
 *
 * 这类节点不能按 id 读写——dynamic-page 下 `getNodeByIdAsync` 对它们永远不返回，
 * 直接把整次编译卡进 10 秒超时。它们属于实例内部，也不该被单独删 / 改名。
 */
function isSublayer(id: string): boolean {
  return id.includes(';');
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

/** 簇：可见内容行 / 分组槽各留一个；隐藏备用池原样保留。 */
async function slimCluster(
  backend: FigmaBackend,
  clusterId: string,
  gaps: CompileGap[]
): Promise<number> {
  const { nodes } = await backend.scanSubtree(clusterId, SCAN_BUDGET);
  let deleted = 0;

  const visibleBullets = nodes.filter(
    (n) => n.name === CLUSTER_SLOTS.bullet && n.visible !== false && !isSublayer(n.id)
  );
  const visibleGroups = nodes.filter(
    (n) => n.name === CLUSTER_SLOTS.groupSlot && n.visible !== false && !isSublayer(n.id)
  );

  const drop = [
    ...visibleBullets.slice(1).map((n) => n.id),
    ...visibleGroups.slice(1).map((n) => n.id)
  ];
  deleted += await deleteAll(backend, drop);

  if (visibleBullets.length === 0) {
    gaps.push({
      what: '簇部件里没有可见内容行',
      impact: '渲染时会克隆其他槽位，可能影响排版',
      fix: '确认归一化已把内容行改名为「正文/规则」'
    });
  }

  return deleted;
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
