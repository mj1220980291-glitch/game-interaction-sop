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

import type { FigmaBackend } from '../figma-client.js';
import { BADGE_MASTER_NAME, CHAPTER_SLOTS, CLUSTER_SLOTS, type PartName } from '../template-slots.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';

const SCAN_BUDGET = 20000;

export interface SlimInput {
  backend: FigmaBackend;
  parts: ReadonlyArray<{ part: PartName; nodeId: string }>;
}

export interface SlimResult {
  deleted: number;
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
  const gaps: CompileGap[] = [];

  for (const { part, nodeId } of input.parts) {
    if (part === 'chapter') {
      deleted += await slimChapter(backend, nodeId, gaps);
    } else if (part === 'cluster') {
      deleted += await slimCluster(backend, nodeId, gaps);
    }
  }

  return { deleted, gaps };
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
    (n) => n.name === CLUSTER_SLOTS.bullet && n.visible !== false
  );
  const visibleGroups = nodes.filter(
    (n) => n.name === CLUSTER_SLOTS.groupSlot && n.visible !== false
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
