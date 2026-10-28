/**
 * 多部件渲染 —— 按 key 导入 4 个部件，detach 后拼成一份文档。
 *
 * 与旧路径的区别只有组装方式：旧路径整份克隆 `1:14` 再按名字填；这里拿的是
 * 我们库里归一化过的独立部件（顶部 / 章节 / 簇 / 结尾），槽位名统一，所以
 * 填充逻辑可以复用 `fillCluster` 等既有实现。
 *
 * 三件旧路径没有的事：
 *   1. 部件带着编译当时那份原稿 → 填充前先清空
 *   2. 4 块没有共同父级 → 自建文档根帧，两遍布局（填充后高度会变）
 *   3. 标号母版在容器里 → 按网格克隆摆位
 *
 * Spec: openspec/changes/engine-multi-part-template-render (D3 / D4 / D5 / D6 / D7)
 */

import type { FigmaBackend, NodeInfo } from '../../figma-client.js';
import type { DocIR, InterfaceSection, SemanticCluster, SoftWarning } from '../../ir.js';
import { SOFT_WARNING_CODES } from '../../ir.js';
import type { TemplatePack } from '../../template/schema.js';
import {
  BADGE_MASTER_NAME,
  CHAPTER_SLOTS,
  CLUSTER_SLOTS,
  OVERVIEW_TEXT_SLOTS,
  TOP_SLOTS,
  isBadgeFrame,
  isBadgeMaster,
  isRoleFrame
} from '../../template-slots.js';
import {
  applyAsset,
  bubbleOffset,
  fillCluster,
  indexCloneByName,
  makeFigureState,
  makeImageSeed,
  type AssetSpec,
  type FigureState
} from '../../render.js';

export const PARTS_RENDER_CODES = {
  LAYOUT_UNSUPPORTED: 'V2_RENDER_LAYOUT_UNSUPPORTED',
  PART_SLOT_MISSING: 'V2_RENDER_PART_SLOT_MISSING',
  BADGE_MASTER_MISSING: 'V2_RENDER_BADGE_MASTER_MISSING',
  OVERVIEW_UNSUPPORTED: 'V2_RENDER_OVERVIEW_UNSUPPORTED',
  SUBGROUP_UNSUPPORTED: 'V2_RENDER_SUBGROUP_UNSUPPORTED'
} as const;

export interface PartsRenderInput {
  ir: DocIR;
  pack: TemplatePack;
  assetMap?: Record<string, AssetSpec>;
  pageId?: string;
  backend: FigmaBackend;
  /** 根帧一建好就回报，失败时外层才能删干净。 */
  onRootCreated?: (id: string) => void;
}

export interface PartsRenderResult {
  rootId: string;
  warnings: SoftWarning[];
  summary: {
    sectionCount: number;
    clusterCount: number;
    bubbleCount: number;
    imagesPlaced: number;
    placeholdersUsed: number;
    figuresPlaced: number;
  };
}

function fail(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** 给每一步加上阶段前缀：真机出错时能直接看出是哪一步。 */
async function stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e as Error & { code?: string };
    throw Object.assign(new Error(`[${name}] ${err.message}`), {
      ...(err.code ? { code: err.code } : {})
    });
  }
}

/** 文档根帧的间距：部件自带留白，这里不再加。 */
const PARTS_GAP = 0;

export async function renderFromParts(input: PartsRenderInput): Promise<PartsRenderResult> {
  const { backend, ir, pack } = input;
  if (!pack.components.top || !pack.components.chapter || !pack.components.cluster) {
    throw fail(PARTS_RENDER_CODES.PART_SLOT_MISSING, '模板包缺少 top / chapter / cluster 三个 key');
  }
  for (const method of ['createFrame', 'resizeNode', 'reparentNode', 'instantiateByKey'] as const) {
    if (typeof backend[method] !== 'function') {
      throw fail(
        PARTS_RENDER_CODES.LAYOUT_UNSUPPORTED,
        `当前 Figma 后端不支持 ${method}——多部件渲染需要新建根帧与重排，不能靠挪坐标凑`
      );
    }
  }

  const caps = pack.capabilities;
  const figures = makeFigureState(input.assetMap);
  const warnings: SoftWarning[] = [];

  assertCapabilityConflicts(ir, pack, warnings);

  let imagesPlaced = 0;
  let placeholdersUsed = 0;

  const top = await stage('instantiate.top', () =>
    instantiate(backend, pack.components.top!, ir.header.title, input.pageId)
  );
  const chapters: NodeInfo[] = [];
  for (let i = 0; i < ir.sections.length; i += 1) {
    chapters.push(
      await stage(`instantiate.chapter${i + 1}`, () =>
        instantiate(backend, pack.components.chapter!, `界面说明${i + 1}`, input.pageId)
      )
    );
  }
  const footer = pack.components.footer
    ? await stage('instantiate.footer', () =>
        instantiate(backend, pack.components.footer!, '结尾', input.pageId)
      )
    : undefined;

  const topInfo = await backend.getNodeInfo(top.id);
  // 根帧宽度取「最宽的部件」。必须在建帧时定好：根帧一旦 resize，Figma 会把
  // HUG 高度翻成 FIXED，根帧高度就变成写死的 1。
  let width = topInfo.absoluteBoundingBox?.width ?? 1920;
  for (const part of [top, ...chapters, ...(footer ? [footer] : [])]) {
    const info = part.id === top.id ? topInfo : await backend.getNodeInfo(part.id);
    width = Math.max(width, info.absoluteBoundingBox?.width ?? 0);
  }
  // 根帧也接上自适应：部件 append 进来就自动纵向排、根帧高度跟着长，
  // 不用再手工累加 y 然后一次性设总高（那个数一错就整篇错位）。
  const autoLayout = typeof backend.setAutoLayout === 'function';
  const root = await stage('root.create', async () => {
    const frame = await backend.createFrame!({
      ...(input.pageId ? { parentId: input.pageId } : {}),
      name: ir.header.title,
      width,
      height: 1
    });
    if (autoLayout) {
      await backend.setAutoLayout!({
        nodeId: frame.id,
        mode: 'VERTICAL',
        itemSpacing: PARTS_GAP,
        hugHeight: true
      });
    }
    return frame;
  });

  const parts: NodeInfo[] = [top, ...chapters, ...(footer ? [footer] : [])];
  input.onRootCreated?.(root.id);
  await stage('reparent', async () => {
    for (const part of parts) {
      await backend.reparentNode({ nodeId: part.id, newParentId: root.id });
    }
  });

  await stage('fill.top', () => fillTop(backend, top, ir, caps.overview, warnings));

  for (let i = 0; i < ir.sections.length; i += 1) {
    const section = ir.sections[i];
    const chapter = chapters[i];
    if (!section || !chapter) continue;
    const placed = await stage(`fill.chapter${i + 1}`, () =>
      fillChapter(backend, chapter, section, {
        ...(input.assetMap?.[section.index] ? { asset: input.assetMap[section.index]! } : {}),
        caps,
        clusterKey: pack.components.cluster!,
        figures,
        warnings,
        ...(input.pageId ? { pageId: input.pageId } : {})
      })
    );
    if (placed.image) imagesPlaced += 1;
    else placeholdersUsed += 1;
  }

  await stage('layout', () => layout(root, parts, backend, autoLayout));

  return {
    rootId: root.id,
    warnings,
    summary: {
      sectionCount: ir.sections.length,
      clusterCount: ir.sections.reduce((n, s) => n + s.clusters.length, 0),
      bubbleCount: caps.badgeSlot === 'container' ? ir.sections.reduce((n, s) => n + s.clusters.length, 0) : 0,
      imagesPlaced,
      placeholdersUsed,
      figuresPlaced: figures.placed
    }
  };
}

async function instantiate(
  backend: FigmaBackend,
  key: string,
  name: string,
  pageId: string | undefined
): Promise<NodeInfo> {
  let node = await backend.instantiateByKey!({
    componentKey: key,
    ...(pageId ? { parentId: pageId } : {}),
    name
  });
  if (backend.detachInstance) node = await backend.detachInstance(node.id);
  // 隐藏母版编译出来的部件，克隆后仍然隐藏（已知坑）。
  if (backend.setNodeVisible) await backend.setNodeVisible(node.id, true);
  return node;
}

async function layout(
  root: NodeInfo,
  parts: NodeInfo[],
  backend: FigmaBackend,
  autoLayout: boolean
): Promise<void> {
  // 自动布局路径下什么都不用做：位置与根帧高度都是算出来的，宽度在建帧时已定。
  if (autoLayout) return;
  let y = 0;
  let width = 0;
  for (const part of parts) {
    const info = await backend.getNodeInfo(part.id);
    const h = info.absoluteBoundingBox?.height ?? 0;
    width = Math.max(width, info.absoluteBoundingBox?.width ?? 0);
    await backend.moveNode(part.id, 0, y);
    y += h + PARTS_GAP;
  }
  await backend.resizeNode!(root.id, width, Math.max(y, 1));
}

// --- capability conflicts ------------------------------------------------

function assertCapabilityConflicts(
  ir: DocIR,
  pack: TemplatePack,
  warnings: SoftWarning[]
): void {
  const caps = pack.capabilities;
  const hasOverview =
    ir.overview.background.trim() !== '' || ir.overview.coreInteraction.trim() !== '';
  if (caps.overview === 'none' && hasOverview) {
    // md 语法强制要求写总览（parser 会拦），模板又没总览区：省略并告警，
    // 不能因为这条把整份文档拒掉。
    warnings.push({
      code: SOFT_WARNING_CODES.W_OVERVIEW_SLOTS_MISSING,
      message: '这份模板没有总览区（overview = none），md 的总览内容未写入画布'
    });
  }
  if (caps.clusterGroups === 'none') {
    for (const section of ir.sections) {
      for (const cluster of section.clusters) {
        if (cluster.groups.some((g) => g.title !== null)) {
          throw fail(
            PARTS_RENDER_CODES.SUBGROUP_UNSUPPORTED,
            `这份模板不支持簇内分级（clusterGroups = none），但第 ${section.index} 章的「${cluster.title}」用了 ####`
          );
        }
      }
    }
  }
}

// --- top -----------------------------------------------------------------

async function fillTop(
  backend: FigmaBackend,
  top: NodeInfo,
  ir: DocIR,
  overview: TemplatePack['capabilities']['overview'],
  warnings: SoftWarning[]
): Promise<void> {
  const named = await indexCloneByName(backend, top.id, [
    TOP_SLOTS.docTitle,
    TOP_SLOTS.owner,
    TOP_SLOTS.group,
    TOP_SLOTS.ticketLink,
    TOP_SLOTS.lastUpdate,
    TOP_SLOTS.overviewBackground,
    TOP_SLOTS.overviewCore
  ]);

  const updates: Array<{ nodeId: string; characters: string }> = [];
  const push = (name: string, text: string): void => {
    const node = named[name];
    if (node && text) updates.push({ nodeId: node.id, characters: text });
  };
  push(TOP_SLOTS.docTitle, ir.header.title);
  push(TOP_SLOTS.owner, ir.header.owner);
  push(TOP_SLOTS.group, ir.header.group);
  push(TOP_SLOTS.ticketLink, ir.header.ticketLink);
  push(TOP_SLOTS.lastUpdate, ir.header.lastUpdate);
  if (updates.length > 0) await backend.setMultipleTextContents(updates);

  if (overview === 'none') return;

  const background = named[TOP_SLOTS.overviewBackground];
  const core = named[TOP_SLOTS.overviewCore];
  if (!background && !core) {
    warnings.push({
      code: SOFT_WARNING_CODES.W_OVERVIEW_SLOTS_MISSING,
      message: '顶部部件里没有总览槽位（功能背景 / 核心交互），总览内容未写入'
    });
    return;
  }
  if (background) await fillBlockText(backend, background, ir.overview.background);
  if (overview === 'single-block') {
    if (core && backend.setNodeVisible) await backend.setNodeVisible(core.id, false);
    return;
  }
  if (core) await fillBlockText(backend, core, ir.overview.coreInteraction);
}

async function fillBlockText(
  backend: FigmaBackend,
  frame: NodeInfo,
  text: string
): Promise<void> {
  if (!text.trim()) return;
  const info = await backend.getNodeInfo(frame.id);
  if (!info.childIds || info.childIds.length === 0) return;
  const children = await backend.getNodesInfo(info.childIds);
  const target =
    children.find((c) => c.type === 'TEXT' && c.name === OVERVIEW_TEXT_SLOTS.body) ??
    children.filter((c) => c.type === 'TEXT').pop();
  if (target) await backend.setTextContent(target.id, text);
}

// --- chapter -------------------------------------------------------------

interface FillChapterCtx {
  asset?: AssetSpec;
  caps: TemplatePack['capabilities'];
  clusterKey: string;
  figures: FigureState;
  warnings: SoftWarning[];
  pageId?: string;
}

async function fillChapter(
  backend: FigmaBackend,
  chapter: NodeInfo,
  section: InterfaceSection,
  ctx: FillChapterCtx
): Promise<{ image: boolean }> {
  const named = await indexCloneByName(backend, chapter.id, [
    CHAPTER_SLOTS.sectionTitle,
    CHAPTER_SLOTS.mainImage,
    CHAPTER_SLOTS.mainImageHint,
    CHAPTER_SLOTS.badgeContainer,
    CHAPTER_SLOTS.clusterHost
  ]);

  const host = named[CHAPTER_SLOTS.clusterHost];
  if (!host) {
    throw fail(
      PARTS_RENDER_CODES.PART_SLOT_MISSING,
      `章节部件缺少簇容器「${CHAPTER_SLOTS.clusterHost}」——重编该项目的模板`
    );
  }

  const b = tracedDeletes(tracedBackend(backend));
  // 原稿清空：簇容器里带着上一份文档的簇，先全删（样式载体在别处，不受影响）。
  // 分批删：一次删几百个节点的子树会让插件长时间占住主线程，连接层直接判超时。
  await stage('chapter.reset', async () => {
    const hostInfo = await backend.getNodeInfo(host.id);
    const ids = hostInfo.childIds ?? [];
    for (let i = 0; i < ids.length; i += 2) {
      await b.deleteNodes(ids.slice(i, i + 2));
    }
  });

  const titleNode = named[CHAPTER_SLOTS.sectionTitle];
  if (titleNode) {
    await backend.setTextContent(titleNode.id, stripIndexPrefix(section.name));
  }

  const mainImage = named[CHAPTER_SLOTS.mainImage];
  let image = false;
  if (mainImage) {
    if (ctx.asset && ctx.asset.type !== 'skip') {
      await applyAsset(backend, mainImage, ctx.asset);
      const hint = named[CHAPTER_SLOTS.mainImageHint];
      if (hint) await backend.deleteNodes([hint.id]);
      image = true;
    } else if (backend.clearFills) {
      await backend.clearFills([mainImage.id]);
    }
  }

  for (let i = 0; i < section.clusters.length; i += 1) {
    const cluster = section.clusters[i];
    if (!cluster) continue;
    if (ctx.caps.figure === 'none' && cluster.bullets.some((b) => /配图\s*[：:]/.test(b))) {
      ctx.warnings.push({
        code: SOFT_WARNING_CODES.W_FIGURE_DROPPED,
        message: `第 ${section.index} 章：模板没有配图槽（figure = none），「${cluster.title}」的配图被丢弃`
      });
    }
    await stage(`chapter.cluster${i + 1}`, async () => {
      const node = await instantiate(b, ctx.clusterKey, cluster.title, ctx.pageId);
      await b.reparentNode({ nodeId: node.id, newParentId: host.id });
      await resetHiddenPool(backend, node, ctx.caps.hiddenPool);
      // 职能/编号的写法差异：不是组件变体 / 不显示编号时，簇里的载体没有意义，
      // 留着只会把原稿角色一起带进产物。
      if (ctx.caps.roleAnnotation !== 'component-variant') {
        await deleteMatching(b, node.id, (n) => isRoleFrameNode(n));
      }
      if (ctx.caps.numberBadge === 'none') {
        await deleteMatching(b, node.id, (n) => n.name === CLUSTER_SLOTS.number);
      }
      const effective = inlineSubtitles(cluster, ctx.caps.clusterGroups);
      const seedId = await findNamed(backend, node.id, CLUSTER_SLOTS.figure);
      await fillCluster(
        tracedDeletes(b),
        node,
        effective,
        undefined,
        i + 1,
        makeImageSeed(seedId),
        section.index,
        i,
        ctx.figures,
        undefined
      );
    });
  }

  await stage('chapter.badges', () => placeBadges(b, chapter, section, ctx));

  // 章节高度贴合内容：模板原高常常远大于本次内容（蛋仔 6240 vs 内容 250），
  // 留着就是一大片空白。宽度不动，只收高度。
  // 部件自带自适应（编译期接上了 HUG 链）时高度是算出来的，写回去会打架，跳过。
  await stage('chapter.fit', async () => {
    if (typeof backend.resizeNode !== 'function') return;
    const info = await backend.getNodeInfo(chapter.id);
    if (info.layoutMode === 'HORIZONTAL' || info.layoutMode === 'VERTICAL') return;
    const top = info.absoluteBoundingBox?.y ?? 0;
    let bottom = 0;
    for (const childId of info.childIds ?? []) {
      const child = await backend.getNodeInfo(childId);
      const box = child.absoluteBoundingBox;
      if (!box) continue;
      bottom = Math.max(bottom, box.y + box.height);
    }
    const height = Math.max(bottom - top, 1);
    if (Math.abs(height - (info.absoluteBoundingBox?.height ?? 0)) > 1) {
      await backend.resizeNode(chapter.id, info.absoluteBoundingBox?.width ?? 2209, height);
    }
  });

  return { image };
}

/**
 * 隐藏备用池：`reuse` 直接用（模板里的隐藏槽就是池子），其余策略先把池子删掉，
 * 免得隐藏节点参与编号、或残留旧文案混进产物。
 */
async function resetHiddenPool(
  backend: FigmaBackend,
  cluster: NodeInfo,
  policy: TemplatePack['capabilities']['hiddenPool']
): Promise<void> {
  if (policy === 'reuse') return;
  const { nodes } = await backend.scanSubtree(cluster.id, 400);
  const hidden = nodes.filter((n) => n.visible === false && n.id !== cluster.id).map((n) => n.id);
  if (hidden.length > 0) await backend.deleteNodes(hidden);
}

/** `inline-subtitle`：`####` 不占槽位，作为该组首行的前缀写入。 */
function inlineSubtitles(
  cluster: SemanticCluster,
  mode: TemplatePack['capabilities']['clusterGroups']
): SemanticCluster {
  if (mode !== 'inline-subtitle') return cluster;
  const bullets: string[] = [];
  for (const group of cluster.groups) {
    const title = group.title;
    group.bullets.forEach((bullet, i) => {
      bullets.push(title && i === 0 ? `${title}：${bullet}` : bullet);
    });
  }
  return { ...cluster, groups: [{ title: null, bullets }], bullets };
}

async function placeBadges(
  backend: FigmaBackend,
  chapter: NodeInfo,
  section: InterfaceSection,
  ctx: FillChapterCtx
): Promise<void> {
  if (section.clusters.length === 0) return;
  if (ctx.caps.badgeSlot !== 'container') {
    ctx.warnings.push({
      code: SOFT_WARNING_CODES.W_BADGE_UNPLACED,
      message: `第 ${section.index} 章：模板不支持图上标号（badgeSlot = ${ctx.caps.badgeSlot}），标号未摆放`
    });
    return;
  }

  const containerId = await findNamed(backend, chapter.id, CHAPTER_SLOTS.badgeContainer);
  if (!containerId) {
    throw fail(
      PARTS_RENDER_CODES.BADGE_MASTER_MISSING,
      `第 ${section.index} 章：找不到标号容器「${CHAPTER_SLOTS.badgeContainer}」——重编该项目的模板`
    );
  }
  const container = await backend.getNodeInfo(containerId);
  const children = container.childIds ? await backend.getNodesInfo(container.childIds) : [];
  const master =
    children.find((c) => isBadgeMaster(c.name)) ?? children.find((c) => isBadgeFrame(c.name));
  if (!master) {
    throw fail(
      PARTS_RENDER_CODES.BADGE_MASTER_MISSING,
      `第 ${section.index} 章：标号容器里没有母版「${BADGE_MASTER_NAME}」——重编该项目的模板（编译会收口母版）`
    );
  }

  // 容器里可能还留着原稿的多个标号（`1:14` 就带 标号/1、标号/2）：
  // 只留母版，其余先删，避免产出一堆重复编号。
  const stale = children.filter((c) => isBadgeFrame(c.name) && c.id !== master.id).map((c) => c.id);
  if (stale.length > 0) await backend.deleteNodes(stale);
  if (master.visible !== false && backend.setNodeVisible) {
    await backend.setNodeVisible(master.id, false);
  }

  for (let i = 0; i < section.clusters.length; i += 1) {
    const bubble = await backend.cloneNode({ sourceId: master.id, parentId: containerId });
    if (backend.renameNode) await backend.renameNode(bubble.id, `标号/${i + 1}`);
    await setBadgeNumber(backend, bubble.id, i + 1);
    await backend.moveNode(bubble.id, bubbleOffset(i).x, bubbleOffset(i).y);
    if (backend.setNodeVisible) await backend.setNodeVisible(bubble.id, true);
  }
}

async function setBadgeNumber(
  backend: FigmaBackend,
  bubbleId: string,
  value: number
): Promise<void> {
  const info = await backend.getNodeInfo(bubbleId);
  if (!info.childIds || info.childIds.length === 0) return;
  const children = await backend.getNodesInfo(info.childIds);
  const text =
    children.find((c) => c.type === 'TEXT' && c.name === '#Number') ??
    children.find((c) => c.type === 'TEXT');
  if (text) await backend.setTextContent(text.id, String(value));
}

async function findNamed(
  backend: FigmaBackend,
  rootId: string,
  name: string
): Promise<string | undefined> {
  const { nodes } = await backend.scanSubtree(rootId, 20000);
  return nodes.find((n) => n.name === name)?.id;
}

/** 删掉子树里符合条件的节点（顶层匹配即整棵删）。 */
async function deleteMatching(
  backend: FigmaBackend,
  rootId: string,
  match: (n: NodeInfo) => boolean
): Promise<void> {
  const { nodes } = await backend.scanSubtree(rootId, 20000);
  const hits = nodes.filter((n) => n.id !== rootId && match(n)).map((n) => n.id);
  if (hits.length > 0) await backend.deleteNodes(hits);
}

function isRoleFrameNode(n: NodeInfo): boolean {
  return n.type === 'FRAME' && isRoleFrame(n.name);
}

/** 给删除操作加上「删的是谁」的上下文；失败时能直接看到节点名与类型。 */
function tracedDeletes(backend: FigmaBackend): FigmaBackend {
  const wrapped = Object.create(backend) as FigmaBackend;
  wrapped.deleteNodes = async (ids: string[]) => {
    try {
      await backend.deleteNodes(ids);
    } catch (e) {
      let detail = '';
      try {
        const infos = await backend.getNodesInfo(ids.slice(0, 5));
        detail = infos.map((i) => `${i.name}[${i.type}]`).join(', ');
      } catch {
        detail = '(names unavailable)';
      }
      throw new Error(
        `deleteNodes(${ids.length})${detail ? ` ${detail}` : ''}: ${(e as Error).message}`
      );
    }
  };
  return wrapped;
}

/** 每个后端方法失败时带上方法名：真机报错能直接定位到那一次调用。 */
function tracedBackend(backend: FigmaBackend): FigmaBackend {
  return new Proxy(backend, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        try {
          return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        } catch (e) {
          throw new Error(`${String(prop)}: ${(e as Error).message}`);
        }
      };
    }
  }) as FigmaBackend;
}

function stripIndexPrefix(s: string): string {
  return s.replace(/^\s*\d+\s*[.、．]\s*/, '');
}
