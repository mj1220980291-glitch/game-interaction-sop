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
 *        a. Before iterating, strip any pre-existing spare 界面说明
 *           sibling placeholders that ship with some templates, so the
 *           parent contains only the master 界面说明1. Then reuse master
 *           for #01, clone master for #02..N (clones appended after
 *           master, in markdown order).
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
  type NodeInfo
} from './figma-client.js';
import type { DocIR, HardError, SoftWarning, SemanticCluster } from './ir.js';

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

  // 5a. Remove any pre-existing spare 界面说明 placeholders carried in from
  //     the master template, EXCEPT the master we are about to reuse.
  //
  //     Bug fix (2026-05-20): the template historically shipped with two
  //     sibling 界面说明 placeholders (界面说明1 = master, 界面说明2 = spare).
  //     If we left them in place, the renderer's downstream clone-append +
  //     trim-from-tail logic would delete a freshly-filled section instead
  //     of the spare, producing a silent "section missing, summary reports
  //     success" bug. Strip spares up-front so the parent only contains the
  //     master before we clone.
  await removeSparesExceptMaster(backend, parentOfSections, masterSectionGroup.id);

  let placeholdersUsed = 0;
  let imagesPlaced = 0;

  // Bug fix (2026-05-28): Two-phase section rendering.
  //
  // PROBLEM: The original single-loop first rendered section 0 into
  // masterSectionGroup, then cloned the already-filled masterSectionGroup
  // for sections 1..N. Each clone inherited section 0's bubble nodes and
  // cluster blocks, which were never cleaned up, producing:
  //   - Duplicate bubble numbers (②③ from section 0 appearing in section 1's
  //     bubble FRAME alongside section 1's own ①②)
  //   - Section 2/3 main images visually identical to section 1 (inherited
  //     bubble positions from the filled clone)
  //
  // FIX: Split into two phases so ALL clones are made while masterSectionGroup
  // is still blank (before any content is written into it).
  //
  // Phase 1 — Clone all section nodes (masterSectionGroup is still empty).
  const sectionNodes: NodeInfo[] = [masterSectionGroup]; // section 0 reuses master
  for (let i = 1; i < ir.sections.length; i++) {
    const clone = await cloneNodeSafe(backend, {
      sourceId: masterSectionGroup.id, // ← still blank at this point
      parentId: parentOfSections,
      name: `界面说明${i + 1}`
    });
    sectionNodes.push(clone);
  }

  // Phase 2 — Render each section into its pre-cloned node.
  for (let i = 0; i < ir.sections.length; i++) {
    const section = ir.sections[i];
    const sectionNode = sectionNodes[i];
    if (!section || !sectionNode) continue;

    await renderSection(backend, sectionNode, section, input.assetMap?.[section.index]);

    if (input.assetMap?.[section.index]?.type === 'image') imagesPlaced++;
    else placeholdersUsed++;
  }

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
// Bug 10 [SUPERSEDED 2026-05-22]: 早期版本统一给 bullet 写入 "· " 前缀以补齐
//                列表外观；现版本改为 **不写任何前缀字符**，让模板 TEXT 节点
//                自带的 listOptions / paragraphIndent 负责视觉列表样式，避免
//                "· " 与图层样式重叠出现两个 marker。同时 inline strip
//                markdown emphasis (**xxx** / __xxx__) 防止字面星号残留。
//                parser 侧仍负责去除 "- "/"* " 等原始 bullet 标记。

const INDEX_PREFIX_RE = /^\s*\d+\s*[.、．]\s*/;
const IMAGE_BULLET_RE = /(^|\s|^[-·•*]+\s*)配图\s*[：:]/;

function stripIndexPrefix(s: string): string {
  return s.replace(INDEX_PREFIX_RE, '').trim();
}

function isImageBullet(bullet: string): boolean {
  return IMAGE_BULLET_RE.test(bullet);
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
  // PR-2 (backend-batch-clone-nodes): replace serial while-loop with single
  // batchCloneNodes call. Original while-loop left as reference comment:
  //   while (clusterNodes.length < wanted) {
  //     const clone = await cloneNodeSafe(backend, { sourceId: source.id, parentId: rightCol.id });
  //     clusterNodes.push(clone);
  //   }
  const clusterNeeded = wanted - clusterNodes.length;
  if (clusterNeeded > 0) {
    const newClusters = await backend.batchCloneNodes({
      sourceId: source.id,
      parentId: rightCol.id,
      count: clusterNeeded
    });
    clusterNodes.push(...newClusters);
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

  // Bug fix (2026-05-28): The 1:14 template ships with 2 seed bubbles inside
  // 气泡 FRAME: [标号/2 (id 1:114), 标号/1 (id 1:118)].  fillCluster uses
  // find(startsWith '标号/') which picks the FIRST child — 标号/2 — as the
  // clone source.  标号/1 is never touched and becomes a permanent orphan,
  // visually duplicating the ① bubble at the template's default position.
  //
  // Fix: before the cluster loop, trim the bubble frame to 1 seed.
  // All excess seeds (index ≥ 1) are deleted here; the first seed is kept
  // as the clone source.  Safe for isGlobalSpec sections too (bubbleFrame
  // will be deleted entirely a few lines later).
  if (bubbleFrame) {
    const bubbleFrameInfo = await backend.getNodeInfo(bubbleFrame.id);
    const seedIds = bubbleFrameInfo.childIds ?? [];
    if (seedIds.length > 1) {
      await backend.deleteNodes(seedIds.slice(1));
    }
  }

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
  // PR-1 (backend-scan-subtree-batch): use single-RTT scanSubtree instead of
  // the old multi-RTT BFS. Falls back to scanAllDescendants when truncated.
  const clusterInfo = await backend.getNodeInfo(clusterNode.id);
  const { nodes: scanned, truncated } = await backend.scanSubtree(clusterNode.id);
  const allDescendants = truncated
    ? await scanAllDescendants(backend, clusterNode.id)
    : scanned;
  if (truncated) {
    process.stderr.write(
      `[render] scanSubtree truncated for cluster ${clusterNode.id} — fell back to multi-RTT BFS\n`
    );
  }

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

  // (Bug 9 / 2026-05-22 follow-up) #Title — placeholder slot reserved for
  // future #### sub-grouping inside a cluster.
  // The v2 IR currently has NO #### support (parser does not emit
  // sub-groups, SemanticCluster has no subgroups field), so every
  // remaining #Title in the cloned cluster would otherwise leak the
  // template's literal "小标题1 / 小标题2" placeholder into the output.
  // Delete all of them. When/if #### support lands, switch this back to
  // "clone+fill per subgroup, drop the rest".
  const subTitles = allDescendants.filter(
    (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterSubTitle
  );
  if (subTitles.length > 0) {
    await backend.deleteNodes(subTitles.map((n) => n.id));
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

  // Bullets: 1 TEXT ("正文/规则") = 1 bullet. Clone or trim to match count.
  const bulletTexts = allDescendants.filter(
    (n) =>
      n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterBulletText
  );
  const bulletNodes: NodeInfo[] = bulletTexts.slice(0, cluster.bullets.length);
  const bulletSource = bulletTexts[0];
  // PR-2 (backend-batch-clone-nodes): replace serial while-loop with single
  // batchCloneNodes call. Original while-loop left as reference comment:
  //   while (bulletNodes.length < cluster.bullets.length && bulletSource) {
  //     const clone = await cloneNodeSafe(backend, { sourceId: bulletSource.id, parentId: bulletSource.parentId });
  //     bulletNodes.push(clone);
  //   }
  const bulletNeeded = cluster.bullets.length - bulletNodes.length;
  if (bulletNeeded > 0 && bulletSource?.parentId) {
    const newBullets = await backend.batchCloneNodes({
      sourceId: bulletSource.id,
      parentId: bulletSource.parentId,
      count: bulletNeeded
    });
    bulletNodes.push(...newBullets);
  }
  if (bulletTexts.length > cluster.bullets.length) {
    await backend.deleteNodes(
      bulletTexts.slice(cluster.bullets.length).map((n) => n.id)
    );
  }
  const bulletUpdates: Array<{ nodeId: string; characters: string }> = [];
  for (let i = 0; i < cluster.bullets.length; i++) {
    const node = bulletNodes[i];
    const raw = cluster.bullets[i] ?? '';
    if (node) {
      // (Bug 10 / 2026-05-22 follow-up)
      // - Strip leading bullet marker ("- " / "* " / "· " / "• ") if any.
      //   The bullet TEXT node in the template is responsible for any
      //   visual list-marker styling; do NOT inline a duplicate "· "
      //   prefix into characters or it shows up twice.
      // - Strip inline markdown emphasis (**bold**, __bold__) — the
      //   template TEXT does not interpret markdown so "**xxx**" would
      //   otherwise leak through as literal asterisks.
      const body = raw
        .replace(/^\s*[-·•*]+\s*/, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .trim();
      bulletUpdates.push({ nodeId: node.id, characters: body });
    }
  }
  if (bulletUpdates.length > 0) {
    await backend.setMultipleTextContents(bulletUpdates);
  }

  // (Bug 3+4) Two-way image placeholder reconciliation.
  const needsImage = cluster.bullets.some(isImageBullet);
  const existingImageGroups = allDescendants.filter(
    (n) => n.type === 'GROUP' && n.name === SECTION_CHILD_NAMES.optionalImagePlaceholder
  );
  if (needsImage && existingImageGroups.length === 0 && seedImageGroupId) {
    await cloneNodeSafe(backend, {
      sourceId: seedImageGroupId,
      parentId: clusterNode.id
    });
  } else if (!needsImage && existingImageGroups.length > 0) {
    await backend.deleteNodes(existingImageGroups.map((n) => n.id));
  } else if (needsImage && existingImageGroups.length > 1) {
    await backend.deleteNodes(existingImageGroups.slice(1).map((n) => n.id));
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
  // PR-1 (backend-scan-subtree-batch): single-RTT scanSubtree.
  const { nodes: scanned, truncated } = await backend.scanSubtree(sectionRootId);
  const all = truncated
    ? await scanAllDescendants(backend, sectionRootId)
    : scanned;
  if (truncated) {
    process.stderr.write(
      `[render] scanSubtree truncated for section ${sectionRootId} in findSeedImageGroup\n`
    );
  }
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
  // The 功能背景 / 核心交互 frame holds two TEXT children:
  //   - #Title    : "1.功能背景" / "2.核心交互"     (must NOT be overwritten)
  //   - #Content  : "功能背景说明文本..." 占位         (target of this fill)
  // Bug fix (2026-05-20): historically the renderer picked the FIRST TEXT,
  // which is #Title, leaving the real body placeholder untouched and
  // clobbering the small section heading. Now we resolve by name; fall
  // back to "last TEXT" if names ever change, since the layout convention
  // is heading-on-top / body-below.
  const info = await backend.getNodeInfo(frameNode.id);
  if (!info.childIds || info.childIds.length === 0) return;
  const children = await backend.getNodesInfo(info.childIds);
  const texts = children.filter((c) => c.type === 'TEXT');
  if (texts.length === 0) return;
  const byName =
    texts.find((c) => c.name === '#Content') ||
    texts.find((c) => c.name === '#Body');
  const target = byName ?? texts[texts.length - 1];
  if (target) {
    await backend.setTextContent(target.id, body);
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
        await backend.rasterizeNodeToImageFill({
          sourceNodeId: asset.nodeId,
          targetNodeId: mainPlaceholder.id,
          scale: 1 // Bug 7: default SCALE=1
        });
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
 * Scan a node subtree and return a name → first-match map, limited to the
 * names we care about.
 *
 * PR-1 (backend-scan-subtree-batch): uses single-RTT scanSubtree when
 * available, falling back to the old multi-RTT BFS when truncated.
 */
async function indexCloneByName(
  backend: FigmaBackend,
  rootId: string,
  names: string[]
): Promise<Record<string, NodeInfo>> {
  const wanted = new Set(names);
  const found: Record<string, NodeInfo> = {};

  // Fast path: get entire subtree in one RTT, then filter in-process.
  const { nodes: scanned, truncated } = await backend.scanSubtree(rootId);
  if (!truncated) {
    for (const info of scanned) {
      if (wanted.has(info.name) && !found[info.name]) {
        found[info.name] = info;
      }
    }
    return found;
  }

  // Fallback: truncated subtree — revert to original multi-RTT BFS.
  process.stderr.write(
    `[render] scanSubtree truncated for ${rootId} in indexCloneByName — falling back to multi-RTT BFS\n`
  );
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

/**
 * Remove every direct child of `parentId` whose id is not `masterId`.
 *
 * Used to strip pre-existing duplicate 界面说明 placeholders that some
 * historical templates shipped with. We do this BEFORE cloning so the
 * remaining clone+append+fill path operates on a clean parent containing
 * only the master section group.
 */
async function removeSparesExceptMaster(
  backend: FigmaBackend,
  parentId: string,
  masterId: string
): Promise<void> {
  const parent = await backend.getNodeInfo(parentId);
  if (!parent.childIds || parent.childIds.length <= 1) return;
  const toDelete = parent.childIds.filter((id) => id !== masterId);
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
