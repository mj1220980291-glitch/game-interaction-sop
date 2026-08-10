/**
 * v2 renderer — orchestrates: parse v2 markdown → fill Figma template 1:14.
 *
 * Single entry: `renderV2MarkdownToFigma({ markdown, assetMap, target, backend })`.
 *
 * High-level flow:
 *   1. parseV2(markdown) → IR  (parser.ts)
 *   2. if errors[] → return early; do not touch Figma.
 *   3. backend.commitUndoCheckpoint("v2-render-start")
 *   4. Clone master template (1:14) into target page.
 *   5. Fill header 5 TEXTs in one batch.
 *   6. Fill overview functional-background + core-interaction (drill into
 *      the body TEXT child of each frame).
 *   7. For each `## NN.` section:
 *        a. Get/clone an 界面说明 group (first uses spareInstanceId
 *           recycled or 界面说明1 directly for #01; subsequent clones from
 *           界面说明1).
 *        b. Scan the cloned subtree once → cache all named children.
 *        c. Set 界面名称 label to `## NN.` text.
 *        d. For each ### cluster (in section):
 *             - clone or reuse 小标题块
 *             - set 小标题 text
 *             - decide roleKeep/roleDelete, batch delete
 *             - set 说明文本 to bullets joined
 *             - clone or hide 配图占位 if 配图 bullet present
 *             - prepare bubble: clone 标号/N, set its number, schedule
 *               position from default grid (or asset-supplied coords)
 *        e. Place main image: if assetMap[index] is image → setImageFill
 *           on 主图占位; if figma_node → reparent that node onto 主图占位
 *           rect; if skip → leave placeholder text.
 *        f. Probe-then-batch the bubble moves.
 *   8. Return { ok, runId, summary }.
 *
 * On any FigmaSafetyError or backend throw mid-flight, attempt one
 * triggerUndo(1) and report failure — DO NOT cascade more mutations.
 */

import { parseV2 } from './parser.js';
import {
  HEADER_SLOTS,
  OVERVIEW_SLOTS,
  SECTION_TEMPLATE,
  SECTION_CHILD_NAMES,
  TEMPLATE_NODE_ID,
  TEMPLATE_FILE_KEY,
  DEFAULT_BUBBLE_GRID,
  ROLE_TEXT_ORDER
} from './template-map.js';
import {
  cloneNodeSafe,
  decideRoleKeepDelete,
  FigmaSafetyError,
  placeBubbleInFrame,
  probeMoveOrThrow,
  type FigmaBackend,
  type NodeInfo,
  type ClusterBlockNodes
} from './figma-client.js';
import type { DocIR, HardError, SoftWarning, SemanticCluster, BulletGroup } from './ir.js';

// --- Public API ----------------------------------------------------------

export type AssetSpec =
  /** Remote or data-URI image bytes. Backend.setImageFill applies directly. */
  | { type: 'image'; src: string }
  /**
   * A node already living in the current Figma file (COMPONENT/FRAME/GROUP).
   * Engine rasterizes its subtree to PNG and applies as IMAGE fill on
   * 主图占位. This avoids reparenting (which would trigger pitfall #1 since
   * 主图占位's parent `rec组` is a GROUP).
   */
  | { type: 'figma_node'; fileKey: string; nodeId: string }
  /** Leave 主图占位 untouched; user will hand-drop an image later. */
  | { type: 'skip' };

export interface RenderInput {
  markdown: string;
  /** sectionIndex (e.g. "01") → asset spec. Missing entries default to "skip". */
  assetMap?: Record<string, AssetSpec>;
  target?: {
    /** Defaults to TEMPLATE_FILE_KEY. */
    fileKey?: string;
    /** Page to host the cloned template instance. If omitted, backend chooses. */
    pageId?: string;
  };
}

export interface RenderResult {
  ok: boolean;
  /** Newly created template-instance node ID (root of the rendered doc). */
  rootInstanceId?: string;
  errors: Array<HardError | { code: string; message: string }>;
  warnings: SoftWarning[];
  summary?: {
    sectionCount: number;
    clusterCount: number;
    bubbleCount: number;
    imagesPlaced: number;
    placeholdersUsed: number;
  };
}

export async function renderV2MarkdownToFigma(
  input: RenderInput,
  backend: FigmaBackend
): Promise<RenderResult> {
  // Phase A — Parse + hard-validate.
  const parsed = parseV2(input.markdown);
  if (!parsed.ok || !parsed.ir) {
    return {
      ok: false,
      errors: parsed.errors,
      warnings: parsed.warnings
    };
  }

  // Phase B — Render. Wrap in undo checkpoint + try/catch for one-shot rollback.
  await backend.commitUndoCheckpoint('v2-render-start');
  let rootInstanceId: string | undefined;
  try {
    rootInstanceId = await renderInner(parsed.ir, input, backend);
  } catch (e) {
    const err = e as Error & { code?: string };
    // Best-effort rollback. Do NOT loop — one undo undoes the checkpoint
    // boundary and lets the user inspect.
    try {
      await backend.triggerUndo(1);
    } catch {
      /* ignore undo failure */
    }
    return {
      ok: false,
      errors: [
        {
          code: err.code ?? 'V2_RENDER_RUNTIME_ERROR',
          message: err.message
        }
      ],
      warnings: parsed.warnings
    };
  }

  return {
    ok: true,
    rootInstanceId,
    errors: [],
    warnings: parsed.warnings,
    summary: summarize(parsed.ir, input.assetMap)
  };
}

// --- Inner renderer ------------------------------------------------------

async function renderInner(
  ir: DocIR,
  input: RenderInput,
  backend: FigmaBackend
): Promise<string> {
  // 1. Clone master template into target page.
  const root = await cloneNodeSafe(backend, {
    sourceId: TEMPLATE_NODE_ID,
    parentId: input.target?.pageId,
    name: ir.header.title
  });

  // 2. Resolve all named children of the cloned subtree we need:
  //    - 标题组件 → 4 TEXT slots + 文档标题 (we re-resolve by ID using HEADER_SLOTS' position-equivalents inside the clone)
  //    - 设计总览组件 → 功能背景 + 核心交互 frames
  //    - Comp_1 → 需求目标 → 界面说明1 (master clone source for sections)
  //
  // Strategy: for each named child needed, scan the clone subtree by name
  // and cache by name. The original 1:14 IDs are NOT valid inside the
  // clone — Figma assigns fresh IDs.
  const nameToNode = await indexCloneByName(backend, root.id, [
    '文档标题',
    '设计师名称',
    '需求组名称',
    '易协作单号链接',
    '更新时间',
    '功能背景',
    '核心交互',
    SECTION_TEMPLATE_NAMES.masterGroup
  ]);

  // 3. Fill header 5 TEXTs in one batch.
  const headerUpdates: Array<{ nodeId: string; characters: string }> = [];
  push(headerUpdates, nameToNode['文档标题']?.id, ir.header.title);
  push(headerUpdates, nameToNode['设计师名称']?.id, ir.header.owner);
  push(headerUpdates, nameToNode['需求组名称']?.id, ir.header.group);
  push(headerUpdates, nameToNode['易协作单号链接']?.id, ir.header.ticketLink);
  push(headerUpdates, nameToNode['更新时间']?.id, ir.header.lastUpdate);
  if (headerUpdates.length > 0) {
    await backend.setMultipleTextContents(headerUpdates);
  }

  // 4. Fill overview body TEXTs.
  await fillOverviewBody(backend, nameToNode['功能背景'], ir.overview.background);
  await fillOverviewBody(backend, nameToNode['核心交互'], ir.overview.coreInteraction);

  // 5. Sections.
  const masterSectionGroup = nameToNode[SECTION_TEMPLATE_NAMES.masterGroup];
  if (!masterSectionGroup) {
    throw new Error(`master section group "${SECTION_TEMPLATE_NAMES.masterGroup}" not found in clone`);
  }
  const parentOfSections = masterSectionGroup.parentId;
  if (!parentOfSections) {
    throw new Error('master section group has no parent — cannot clone siblings');
  }

  let placeholdersUsed = 0;
  let imagesPlaced = 0;

  for (let i = 0; i < ir.sections.length; i++) {
    const section = ir.sections[i];
    if (!section) continue;
    let sectionNode: NodeInfo;
    if (i === 0) {
      // Reuse the master directly to avoid an extra clone.
      sectionNode = masterSectionGroup;
    } else {
      sectionNode = await cloneNodeSafe(backend, {
        sourceId: masterSectionGroup.id,
        parentId: parentOfSections,
        name: `界面说明${i + 1}`
      });
    }

    await renderSection(backend, sectionNode, section, input.assetMap?.[section.index]);

    if (input.assetMap?.[section.index]?.type === 'image') imagesPlaced++;
    else placeholdersUsed++;
  }

  // 6. Suppress the spare 界面说明2 from the original template clone if it
  //    was carried in as an extra child past sections.length.
  await trimSpareInstances(backend, parentOfSections, ir.sections.length);

  return root.id;
}

// --- Section rendering ---------------------------------------------------

// TODO(v0.2-fix)  —  必修 bug 清单，详见 docs/figma-mcp-pitfalls.md
//
// 2026-05-13 第二次实盘（玩家等级系统）后补：
//
// Bug 1 [FIXED]: 克隆"说明块"后，内部 `Number` TEXT 没被改。
//               修复：每次 cloneNode 后立即 setTextContent(Number, String(idx+1))。
//
// Bug 2 [FIXED]: 写 #Title_Main 时不要加 "N." 前缀。
//               修复：stripIndexPrefix(cluster.title) 后再写入。
//
// Bug 3 [FIXED]: 配图占位处理必须双向——需要+没有时从兄弟块克隆补上；不需要+有时删除；多余时保留首个。
//
// Bug 4 [FIXED]: 配图 bullet 匹配容忍前缀 "- "/"· "/"• " 和 "：/:"。
//               实现：/(^|\s|^[-·•*]\s*)配图\s*[：:]/
//
// Bug 5 [FIXED]: 气泡 FRAME 的 parent 是 rec组:GROUP，禁止 move 气泡 FRAME 本身（触发陷阱 1 坐标爆炸）。
//               改为 move 气泡 FRAME 内部的 标号/N 子节点（FRAME-local 坐标）。
//               气泡 FRAME 本身当 1920x1080 全屏锚点不动。
//
// Bug 9 [FIXED]: #Title_Main 下方 7-TEXT 角色 FRAME 在模板里有两套兄弟副本（对应 #Title 两份示例）。
//               fillCluster 里只操作第 1 个，多余的（若有）整体删除。
//               类似地 #Title 也有两份，只保留第一个。
//
// Bug 10 [FIXED]: bullet 前缀统一写入 "· " + 内容，parser 侧已去除 "- "/"* " 等原始前缀。

const INDEX_PREFIX_RE = /^\s*\d+\s*[.、．]\s*/;
const IMAGE_BULLET_RE = /(^|\s|^[-·•*]+\s*)配图\s*[：:]/;

function stripIndexPrefix(s: string): string {
  return s.replace(INDEX_PREFIX_RE, '').trim();
}

function isImageBullet(bullet: string): boolean {
  return IMAGE_BULLET_RE.test(bullet);
}

/**
 * Clone a cluster block node and scan its children into a `ClusterBlockNodes`
 * snapshot. Uses one `cloneNodeSafe` call + one `getNodesInfo` batch scan.
 *
 * Q1 answer (verified): `#Title` (clusterSubTitle) is a fixed node present in
 * every cloned block — we can always call `setTextContent` on it directly.
 * Q2 answer (verified): the right-column container uses AUTO_LAYOUT, so
 * cloned blocks are automatically stacked vertically — no manual moveNode needed.
 */
async function cloneClusterBlock(
  backend: FigmaBackend,
  sourceId: string,
  parentId: string
): Promise<ClusterBlockNodes> {
  const cloned = await cloneNodeSafe(backend, { sourceId, parentId });
  const allDesc = await scanAllDescendants(backend, cloned.id);
  return buildClusterBlockNodes(cloned.id, allDesc);
}

/**
 * Build a `ClusterBlockNodes` from an already-scanned descendant list.
 * Used for the first group (which reuses the original clusterNode scan).
 */
function buildClusterBlockNodes(blockId: string, allDescendants: NodeInfo[]): ClusterBlockNodes {
  const subTitle = allDescendants.find(
    (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterSubTitle
  );
  const allBulletTexts = allDescendants.filter(
    (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterBulletText
  );
  const bulletSource = allBulletTexts[0];
  const roleFrame = allDescendants.find(
    (n) => n.type === 'FRAME' && n.name.startsWith(SECTION_CHILD_NAMES.roleTagsFramePrefix)
  );
  const imagePlaceholders = allDescendants.filter(
    (n) => n.type === 'GROUP' && n.name === SECTION_CHILD_NAMES.optionalImagePlaceholder
  );
  return { blockId, subTitle, bulletSource, allBulletTexts, roleFrame, imagePlaceholders };
}

/**
 * Write a group's bullets into a cluster block.
 * Returns the collected `{nodeId, characters}` pairs for later batch commit.
 */
async function fillBulletsForBlock(
  backend: FigmaBackend,
  block: ClusterBlockNodes,
  bullets: string[]
): Promise<Array<{ nodeId: string; characters: string }>> {
  const { allBulletTexts, bulletSource } = block;

  // Clone up to needed count.
  const bulletNodes: NodeInfo[] = allBulletTexts.slice(0, bullets.length);
  while (bulletNodes.length < bullets.length && bulletSource) {
    const clone = await cloneNodeSafe(backend, {
      sourceId: bulletSource.id,
      parentId: bulletSource.parentId
    });
    bulletNodes.push(clone);
  }
  // Delete surplus.
  if (allBulletTexts.length > bullets.length) {
    await backend.deleteNodes(allBulletTexts.slice(bullets.length).map((n) => n.id));
  }

  const updates: Array<{ nodeId: string; characters: string }> = [];
  for (let i = 0; i < bullets.length; i++) {
    const node = bulletNodes[i];
    const raw = bullets[i] ?? '';
    if (node) {
      // (Bug 10) Normalize to "· " prefix.
      const body = raw.replace(/^\s*[-·•*]+\s*/, '').trim();
      updates.push({ nodeId: node.id, characters: `· ${body}` });
    }
  }
  return updates;
}

/**
 * Insert (or overwrite) the subgroup title into a block's `#Title` TEXT.
 * Falls back to cloning bulletSource and placing it above bullets if #Title
 * is absent (shouldn't happen with canonical template, but defensive).
 */
async function insertSubgroupTitleText(
  backend: FigmaBackend,
  block: ClusterBlockNodes,
  title: string
): Promise<void> {
  if (block.subTitle) {
    await backend.setTextContent(block.subTitle.id, title);
  } else if (block.bulletSource) {
    // Fallback: clone bullet TEXT, set it as heading, place 4px above bullets.
    const newTitle = await cloneNodeSafe(backend, {
      sourceId: block.bulletSource.id,
      parentId: block.bulletSource.parentId
    });
    await backend.setTextContent(newTitle.id, title);
    // Move above the bullet source (FRAME-local Y - 4px).
    const srcBox = block.bulletSource.absoluteBoundingBox;
    const frameBox = newTitle.absoluteBoundingBox;
    if (srcBox && frameBox) {
      await backend.moveNode(newTitle.id, srcBox.x, srcBox.y - frameBox.height - 4);
    }
  }
}

/**
 * Handle image placeholder for a single group block:
 * - if group has image bullet  → keep/clone placeholder
 * - if group has no image bullet → delete placeholder(s)
 */
async function reconcileImagePlaceholderForBlock(
  backend: FigmaBackend,
  block: ClusterBlockNodes,
  groupBullets: string[],
  seedImageGroupId: string | undefined
): Promise<void> {
  const needsImage = groupBullets.some(isImageBullet);
  const existing = block.imagePlaceholders;
  if (needsImage && existing.length === 0 && seedImageGroupId) {
    await cloneNodeSafe(backend, {
      sourceId: seedImageGroupId,
      parentId: block.blockId
    });
  } else if (!needsImage && existing.length > 0) {
    await backend.deleteNodes(existing.map((n) => n.id));
  } else if (needsImage && existing.length > 1) {
    await backend.deleteNodes(existing.slice(1).map((n) => n.id));
  }
}

/**
 * Fill multiple groups into their own cloned cluster blocks.
 * Called by fillCluster when groups.length > 1 OR groups[0].title !== null.
 */
async function fillClusterMultiGroup(
  backend: FigmaBackend,
  clusterNode: NodeInfo,
  groups: BulletGroup[],
  roles: string[],
  seedImageGroupId: string | undefined,
  allDescendants: NodeInfo[]
): Promise<void> {
  // Batch accumulator — all bullet updates across all groups, sent in one call.
  const allBulletUpdates: Array<{ nodeId: string; characters: string }> = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;

    let block: ClusterBlockNodes;
    if (i === 0) {
      // Reuse the existing clusterNode scan result (no extra Figma API call).
      block = buildClusterBlockNodes(clusterNode.id, allDescendants);
    } else {
      // Clone a new block for this group.
      block = await cloneClusterBlock(backend, clusterNode.id, clusterNode.parentId ?? clusterNode.id);
    }

    // (A) Subgroup title.
    if (group.title !== null) {
      await insertSubgroupTitleText(backend, block, group.title);
    }

    // (B) Bullets.
    const updates = await fillBulletsForBlock(backend, block, group.bullets);
    allBulletUpdates.push(...updates);

    // (C) Role tags: keep+delete on first block, entirely delete on rest.
    if (i === 0) {
      // keep-first dedup (Bug 9) — same as single-group path
      const roleFrames = allDescendants.filter(
        (n) => n.type === 'FRAME' && n.name.startsWith(SECTION_CHILD_NAMES.roleTagsFramePrefix)
      );
      if (roleFrames.length > 1) {
        await backend.deleteNodes(roleFrames.slice(1).map((n) => n.id));
      }
      const primaryRoleFrame = roleFrames[0];
      if (primaryRoleFrame) {
        const info = await backend.getNodeInfo(primaryRoleFrame.id);
        if (info.childIds && info.childIds.length > 0) {
          const children = await backend.getNodesInfo(info.childIds);
          const decision = decideRoleKeepDelete(children, roles);
          if (decision.delete.length > 0) {
            await backend.deleteNodes(decision.delete);
          }
        }
      }
    } else if (block.roleFrame) {
      // Entirely remove role tags from 2nd+ group blocks (no repetition).
      await backend.deleteNodes([block.roleFrame.id]);
    }

    // (D) Image placeholder per-block.
    await reconcileImagePlaceholderForBlock(backend, block, group.bullets, seedImageGroupId);
  }

  // Batch all bullet text updates in one roundtrip.
  if (allBulletUpdates.length > 0) {
    await backend.setMultipleTextContents(allBulletUpdates);
  }
}

/**
 * Duck-type check for the adapter-layer `FigmaExecError.isBridgeTimeout`
 * flag. Kept as a duck-type rather than an `instanceof` so the engine
 * has no runtime dependency on `@game-interaction-sop/mcp-adapter`.
 *
 * See pitfalls.md Bug 15: the MCP bridge has a 7s timeout per
 * figma_execute call, and large image exports can exceed it. When this
 * flag is true, callers should downgrade gracefully (e.g. leave the
 * main image placeholder and let the user hand-drop later) instead of
 * aborting the whole render.
 */
function isBridgeTimeoutError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'isBridgeTimeout' in err &&
    (err as { isBridgeTimeout?: unknown }).isBridgeTimeout === true
  );
}

async function renderSection(
  backend: FigmaBackend,
  sectionNode: NodeInfo,
  section: DocIR['sections'][number],
  asset: AssetSpec | undefined
): Promise<void> {
  // Re-index this section's named children.
  const named = await indexCloneByName(backend, sectionNode.id, [
    SECTION_CHILD_NAMES.interfaceNameLabel,
    SECTION_CHILD_NAMES.mainImagePlaceholder,
    SECTION_CHILD_NAMES.mainImagePlaceholderHint,
    SECTION_CHILD_NAMES.bubbleOverlayFrame,
    SECTION_CHILD_NAMES.rightColumnContainer
  ]);

  // 1) #Name label — interface name. Strip any accidental "NN." prefix.
  const nameLabel = named[SECTION_CHILD_NAMES.interfaceNameLabel];
  if (nameLabel) {
    await backend.setTextContent(nameLabel.id, stripIndexPrefix(section.name));
  }

  // 2) Resolve the right-column container (AUTO_LAYOUT FRAME "Text"), then
  //    reconcile cluster block count to ir.clusters.length.
  const rightCol = named[SECTION_CHILD_NAMES.rightColumnContainer];
  if (!rightCol) {
    throw new Error(
      `section "${section.name}" missing right-column "${SECTION_CHILD_NAMES.rightColumnContainer}"`
    );
  }
  const rightColInfo = await backend.getNodeInfo(rightCol.id);
  const rightColChildren = rightColInfo.childIds
    ? await backend.getNodesInfo(rightColInfo.childIds)
    : [];
  const existingBlocks = rightColChildren.filter((c) =>
    c.name.startsWith(SECTION_CHILD_NAMES.clusterBlockPrefix)
  );

  const wanted = section.clusters.length;
  const clusterNodes: NodeInfo[] = existingBlocks.slice(0, wanted);
  // Clone from first block for any missing slots.
  const source = existingBlocks[0];
  if (!source) {
    throw new Error(
      `section "${section.name}" has no "${SECTION_CHILD_NAMES.clusterBlockPrefix}XX" children to seed from`
    );
  }
  while (clusterNodes.length < wanted) {
    const clone = await cloneNodeSafe(backend, {
      sourceId: source.id,
      parentId: rightCol.id
    });
    clusterNodes.push(clone);
  }
  // Trim extras.
  if (existingBlocks.length > wanted) {
    const extraIds = existingBlocks.slice(wanted).map((n) => n.id);
    await backend.deleteNodes(extraIds);
  }

  // 3) Fill each cluster. Sibling-scan once for a seed 配图 GROUP (used if
  //    a cluster needs an image but its block has none — Bug 3).
  const bubbleFrame = named[SECTION_CHILD_NAMES.bubbleOverlayFrame];
  const seedImageGroupId = await findSeedImageGroup(backend, sectionNode.id);

  const bubbleNodes: NodeInfo[] = [];
  for (let i = 0; i < section.clusters.length; i++) {
    const c = section.clusters[i];
    const cn = clusterNodes[i];
    if (!c || !cn) continue;
    const bubble = await fillCluster(
      backend,
      cn,
      c,
      section.isGlobalSpec ? undefined : bubbleFrame,
      i + 1,
      seedImageGroupId
    );
    if (bubble) bubbleNodes.push(bubble);
  }

  // 4) Place main image / asset. OR, for global-spec sections, strip the
  //    main-image + bubble apparatus entirely (Bug 14).
  const mainPlaceholder = named[SECTION_CHILD_NAMES.mainImagePlaceholder];
  if (section.isGlobalSpec) {
    // Global-spec section (e.g. "等级数字全局展示"): no independent UI image,
    // only cluster text matters. Strip main-image + hint + bubble overlay so
    // the section reads as a pure spec list.
    const stripIds: string[] = [];
    if (mainPlaceholder) stripIds.push(mainPlaceholder.id);
    const hint = named[SECTION_CHILD_NAMES.mainImagePlaceholderHint];
    if (hint) stripIds.push(hint.id);
    if (bubbleFrame) stripIds.push(bubbleFrame.id);
    if (stripIds.length > 0) await backend.deleteNodes(stripIds);
    // Bubble nodes collected earlier are now orphan references — discard them
    // so step 5 skips the probe/batch.
    bubbleNodes.length = 0;
  } else if (mainPlaceholder && asset) {
    await applyAsset(backend, mainPlaceholder, asset);
    // Hide the "主图占位 待手动替换" hint once image is applied (Bug 8).
    if (asset.type !== 'skip') {
      const hint = named[SECTION_CHILD_NAMES.mainImagePlaceholderHint];
      if (hint) {
        await backend.deleteNodes([hint.id]);
      }
    }
  }

  // 5) Position bubbles. The 气泡 FRAME itself MUST NOT be moved (its parent
  //    rec组 is a GROUP; Bug 5). We only move the 标号/N children, which sit
  //    inside the 气泡 FRAME with FRAME-local coords.
  if (!section.isGlobalSpec && bubbleFrame && bubbleNodes.length > 0) {
    const bubbleFrameInfo = await backend.getNodeInfo(bubbleFrame.id);
    const first = bubbleNodes[0];
    if (first) {
      await probeMoveOrThrow(backend, first, bubbleFrameInfo, bubbleOffset(0));
    }
    for (let i = 1; i < bubbleNodes.length; i++) {
      const b = bubbleNodes[i];
      if (!b) continue;
      await placeBubbleInFrame(backend, b, bubbleFrameInfo, bubbleOffset(i));
    }
  }
}

async function fillCluster(
  backend: FigmaBackend,
  clusterNode: NodeInfo,
  cluster: SemanticCluster,
  bubbleFrame: NodeInfo | undefined,
  bubbleNumber: number,
  seedImageGroupId: string | undefined
): Promise<NodeInfo | undefined> {
  // Re-index names inside this cluster block.
  const clusterInfo = await backend.getNodeInfo(clusterNode.id);
  const allDescendants = await scanAllDescendants(backend, clusterNode.id);

  // (Bug 1) Number TEXT → 1-based cluster index.
  const numberTexts = allDescendants.filter(
    (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterNumberText
  );
  if (numberTexts.length > 0 && numberTexts[0]) {
    await backend.setTextContent(numberTexts[0].id, String(bubbleNumber));
  }

  // (Bug 2) #Title_Main → cluster.title, strip "NN." prefix defensively.
  const titleMains = allDescendants.filter(
    (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterTitle
  );
  if (titleMains.length > 0 && titleMains[0]) {
    await backend.setTextContent(
      titleMains[0].id,
      stripIndexPrefix(cluster.title)
    );
  }

  // (Bug 9) #Title — template ships two "说明" sub-labels; keep first, delete rest.
  const subTitles = allDescendants.filter(
    (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterSubTitle
  );
  if (subTitles.length > 1) {
    await backend.deleteNodes(subTitles.slice(1).map((n) => n.id));
  }

  // Role tags (Bug 9): template may carry multiple "Frame 4273..." role frames.
  // Keep the first, delete the rest.
  const roleFrames = allDescendants.filter(
    (n) =>
      n.type === 'FRAME' && n.name.startsWith(SECTION_CHILD_NAMES.roleTagsFramePrefix)
  );
  if (roleFrames.length > 1) {
    await backend.deleteNodes(roleFrames.slice(1).map((n) => n.id));
  }
  const primaryRoleFrame = roleFrames[0];
  if (primaryRoleFrame) {
    const info = await backend.getNodeInfo(primaryRoleFrame.id);
    if (info.childIds && info.childIds.length > 0) {
      const children = await backend.getNodesInfo(info.childIds);
      const decision = decideRoleKeepDelete(children, cluster.roles);
      if (decision.delete.length > 0) {
        await backend.deleteNodes(decision.delete);
      }
    }
  }

  // Bullets + subgroup handling.
  //
  // Decision tree (D2 from design.md):
  //   - isSingleDefault → 向后兼容路径，与 v2 旧版字节级一致
  //   - otherwise      → multi-group path, each group gets its own block
  const isSingleDefault =
    cluster.groups.length === 1 && cluster.groups[0]!.title === null;

  if (isSingleDefault) {
    // ── Legacy-compatible path ────────────────────────────────────────────
    // Exactly matches pre-groups behaviour: flat bullet list, no subgroup heading.
    const bullets = cluster.groups[0]!.bullets;

    const bulletTexts = allDescendants.filter(
      (n) =>
        n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterBulletText
    );
    const bulletNodes: NodeInfo[] = bulletTexts.slice(0, bullets.length);
    const bulletSource = bulletTexts[0];
    while (bulletNodes.length < bullets.length && bulletSource) {
      const clone = await cloneNodeSafe(backend, {
        sourceId: bulletSource.id,
        parentId: bulletSource.parentId
      });
      bulletNodes.push(clone);
    }
    if (bulletTexts.length > bullets.length) {
      await backend.deleteNodes(bulletTexts.slice(bullets.length).map((n) => n.id));
    }
    const bulletUpdates: Array<{ nodeId: string; characters: string }> = [];
    for (let i = 0; i < bullets.length; i++) {
      const node = bulletNodes[i];
      const raw = bullets[i] ?? '';
      if (node) {
        const body = raw.replace(/^\s*[-·•*]+\s*/, '').trim();
        bulletUpdates.push({ nodeId: node.id, characters: `· ${body}` });
      }
    }
    if (bulletUpdates.length > 0) {
      await backend.setMultipleTextContents(bulletUpdates);
    }

    // (Bug 3+4) Two-way image placeholder reconciliation.
    const needsImage = bullets.some(isImageBullet);
    const existingImageGroups = allDescendants.filter(
      (n) => n.type === 'GROUP' && n.name === SECTION_CHILD_NAMES.optionalImagePlaceholder
    );
    if (needsImage && existingImageGroups.length === 0 && seedImageGroupId) {
      await cloneNodeSafe(backend, { sourceId: seedImageGroupId, parentId: clusterNode.id });
    } else if (!needsImage && existingImageGroups.length > 0) {
      await backend.deleteNodes(existingImageGroups.map((n) => n.id));
    } else if (needsImage && existingImageGroups.length > 1) {
      await backend.deleteNodes(existingImageGroups.slice(1).map((n) => n.id));
    }
  } else {
    // ── Multi-group path ──────────────────────────────────────────────────
    // Each group gets its own cloned block with optional subgroup title.
    await fillClusterMultiGroup(
      backend,
      clusterNode,
      cluster.groups,
      cluster.roles,
      seedImageGroupId,
      allDescendants
    );
  }

  void clusterInfo;

  // Bubble: clone 标号/N inside 气泡 FRAME, set #Number TEXT.
  if (!bubbleFrame) return undefined;
  const bubbleFrameInfo = await backend.getNodeInfo(bubbleFrame.id);
  if (!bubbleFrameInfo.childIds || bubbleFrameInfo.childIds.length === 0) {
    return undefined;
  }
  const allBubbleChildren = await backend.getNodesInfo(bubbleFrameInfo.childIds);
  const sourceBubble =
    allBubbleChildren.find((c) =>
      c.name.startsWith(SECTION_CHILD_NAMES.bubbleNumberPrefix)
    ) ?? allBubbleChildren[0];
  if (!sourceBubble) return undefined;

  let myBubble: NodeInfo;
  if (bubbleNumber === 1) {
    myBubble = sourceBubble;
  } else {
    myBubble = await cloneNodeSafe(backend, {
      sourceId: sourceBubble.id,
      parentId: bubbleFrame.id
    });
  }
  // Locate #Number TEXT inside the bubble.
  const myBubbleInfo = await backend.getNodeInfo(myBubble.id);
  if (myBubbleInfo.childIds && myBubbleInfo.childIds.length > 0) {
    const kids = await backend.getNodesInfo(myBubbleInfo.childIds);
    const numText =
      kids.find(
        (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.bubbleNumberText
      ) ?? kids.find((n) => n.type === 'TEXT');
    if (numText) await backend.setTextContent(numText.id, String(bubbleNumber));
  }
  return myBubble;
}

/**
 * Locate a seed 配图 GROUP anywhere under the section, to use as a clone
 * source for clusters whose template block shipped without one. Falls back
 * to `undefined` if none exists (caller must decide whether to warn).
 */
async function findSeedImageGroup(
  backend: FigmaBackend,
  sectionRootId: string
): Promise<string | undefined> {
  const all = await scanAllDescendants(backend, sectionRootId);
  const hit = all.find(
    (n) => n.type === 'GROUP' && n.name === SECTION_CHILD_NAMES.optionalImagePlaceholder
  );
  return hit?.id;
}

/**
 * BFS all descendants of a subtree. Used by fillCluster to reach deeply
 * nested TEXT/FRAME nodes (the template isn't a flat structure).
 */
async function scanAllDescendants(
  backend: FigmaBackend,
  rootId: string,
  maxNodes = 500
): Promise<NodeInfo[]> {
  const out: NodeInfo[] = [];
  const queue: string[] = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0 && out.length < maxNodes) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const info = await backend.getNodeInfo(id);
    out.push(info);
    if (info.childIds) for (const c of info.childIds) queue.push(c);
  }
  return out;
}

// --- Helpers -------------------------------------------------------------

async function fillOverviewBody(
  backend: FigmaBackend,
  frameNode: NodeInfo | undefined,
  body: string
): Promise<void> {
  if (!frameNode) return;
  // The 功能背景 / 核心交互 frame typically holds a TEXT child for the
  // body. Find the first TEXT descendant by scanning one level.
  const info = await backend.getNodeInfo(frameNode.id);
  if (!info.childIds || info.childIds.length === 0) return;
  const children = await backend.getNodesInfo(info.childIds);
  const textChild = children.find((c) => c.type === 'TEXT');
  if (textChild) {
    await backend.setTextContent(textChild.id, body);
  }
}

async function applyAsset(
  backend: FigmaBackend,
  mainPlaceholder: NodeInfo,
  asset: AssetSpec
): Promise<void> {
  switch (asset.type) {
    case 'image':
      if (backend.setImageFill) {
        await backend.setImageFill({ nodeId: mainPlaceholder.id, src: asset.src });
      }
      break;
    case 'figma_node':
      // Bug 6 fix: COMPONENT/FRAME/GROUP source → rasterize to PNG → apply as
      // IMAGE fill. Do NOT reparent the source into rec组 (GROUP parent would
      // trigger pitfall #1 coord explosion).
      if (backend.rasterizeNodeToImageFill) {
        try {
          await backend.rasterizeNodeToImageFill({
            sourceNodeId: asset.nodeId,
            targetNodeId: mainPlaceholder.id,
            scale: 1 // Bug 7: default SCALE=1
          });
        } catch (err) {
          // Bug 15 (2026-05-13): the MCP bridge has a 7s hard timeout per
          // figma_execute, and a 1920×1080 multi-layer COMPONENT PNG export
          // can exceed that budget. When the adapter reports
          // `isBridgeTimeout=true`, downgrade to "skip" semantics: leave
          // the placeholder and let the user hand-drop an image instead of
          // aborting the entire render.
          if (isBridgeTimeoutError(err)) {
            // eslint-disable-next-line no-console
            console.warn(
              `[render.ts] rasterize timed out for placeholder ${mainPlaceholder.id}; ` +
                `leaving placeholder untouched (user can hand-drop image later). ` +
                `Source was ${asset.nodeId}. See pitfalls.md Bug 15.`
            );
            break;
          }
          throw err;
        }
      } else {
        // Fallback for older backends without rasterize — still avoid the
        // unsafe reparent path. Just leave the placeholder; caller will see
        // that no image was applied.
        // eslint-disable-next-line no-console
        console.warn(
          `[render.ts] backend lacks rasterizeNodeToImageFill; skipping figma_node asset for placeholder ${mainPlaceholder.id}`
        );
      }
      break;
    case 'skip':
      // Leave placeholder text untouched.
      break;
  }
}

/**
 * Scan a node subtree breadth-first and return a name → first-match map,
 * limited to the names we care about. Stops as soon as all names are
 * resolved to keep round-trips low.
 */
async function indexCloneByName(
  backend: FigmaBackend,
  rootId: string,
  names: string[]
): Promise<Record<string, NodeInfo>> {
  const wanted = new Set(names);
  const found: Record<string, NodeInfo> = {};
  const queue: string[] = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0 && Object.keys(found).length < names.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const info = await backend.getNodeInfo(id);
    // Match by exact name OR by name starting with the wanted token (for
    // e.g. "界面说明1" matching wanted "界面说明1").
    if (wanted.has(info.name) && !found[info.name]) {
      found[info.name] = info;
    }
    if (info.childIds) {
      for (const c of info.childIds) queue.push(c);
    }
  }
  return found;
}

async function trimSpareInstances(
  backend: FigmaBackend,
  parentId: string,
  keepCount: number
): Promise<void> {
  const parent = await backend.getNodeInfo(parentId);
  if (!parent.childIds || parent.childIds.length <= keepCount) return;
  const toDelete = parent.childIds.slice(keepCount);
  if (toDelete.length > 0) await backend.deleteNodes(toDelete);
}

function bubbleOffset(index0: number): { x: number; y: number } {
  const grid = DEFAULT_BUBBLE_GRID[index0];
  if (grid) return grid;
  // Beyond the default 8 → wrap into a uniform 4-col grid below the defaults.
  const beyond = index0 - DEFAULT_BUBBLE_GRID.length;
  const col = beyond % 4;
  const row = Math.floor(beyond / 4);
  return {
    x: 200 + col * 480,
    y: 980 + row * 80
  };
}

function summarize(ir: DocIR, assetMap?: Record<string, AssetSpec>): RenderResult['summary'] {
  let clusters = 0;
  let bubbles = 0;
  for (const s of ir.sections) {
    clusters += s.clusters.length;
    bubbles += s.clusters.length;
  }
  let imagesPlaced = 0;
  let placeholdersUsed = 0;
  for (const s of ir.sections) {
    const a = assetMap?.[s.index];
    if (a?.type === 'image' || a?.type === 'figma_node') imagesPlaced++;
    else placeholdersUsed++;
  }
  return {
    sectionCount: ir.sections.length,
    clusterCount: clusters,
    bubbleCount: bubbles,
    imagesPlaced,
    placeholdersUsed
  };
}

function push(
  list: Array<{ nodeId: string; characters: string }>,
  id: string | undefined,
  characters: string
): void {
  if (id) list.push({ nodeId: id, characters });
}

// Re-export name constant subset for callers that only need this.
const SECTION_TEMPLATE_NAMES = {
  masterGroup: '界面说明1'
} as const;

// Mark unused imports as intentional.
void TEMPLATE_FILE_KEY;
void ROLE_TEXT_ORDER;
void SECTION_TEMPLATE;
void HEADER_SLOTS;
void OVERVIEW_SLOTS;
void FigmaSafetyError;
