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
 *             - 正文/规则 + 配图占位 in bullet order: each `配图：` bullet
 *               becomes one 配图 GROUP right after the rule it follows
 *               (several per block allowed); image-free blocks keep the
 *               original in-place path
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
  DEFAULT_BUBBLE_GRID,
  ROLE_TEXT_ORDER
} from './template-map.js';
import {
  resolveTemplateConfig,
  DEFAULT_TEMPLATE,
  type TemplateRef
} from './template-config.js';
import {
  findRoleBlockBody,
  loadRoleBlocks,
  parseRoleBullet,
  type RoleBlockRuntime
} from './role-block.js';

import {
  cloneNodeSafe,
  decideRoleKeepDelete,
  FigmaSafetyError,
  placeBubbleInFrame,
  probeMoveOrThrow,
  type CropRect,
  type FigmaBackend,
  type NodeInfo,
  type TextUpdate,
  type TextWriteResult
} from './figma-client.js';
import { stateBoldLength } from './state-line.js';
import { SOFT_WARNING_CODES } from './ir.js';
import type { DocIR, HardError, SoftWarning, SemanticCluster } from './ir.js';
import { stampRenderedDoc } from './reconcile/layout.js';
import {
  reconcileV2,
  type ReconcileChange,
  type ReconcileConflict,
  type ReconcilePreserved
} from './reconcile/index.js';

// --- Traced clone helper -------------------------------------------------

/**
 * Contextual info attached to each cloneNode call site so that failures
 * surface the exact location in the render pipeline instead of a bare ID.
 */
interface RenderTrace {
  /** Logical name of the call site, e.g. 'phase1.master', 'fillCluster.bubble'. */
  callSite: string;
  /** `## NN.` section index, e.g. "01". */
  sectionIndex?: string;
  /** 0-based cluster index inside the section. */
  clusterIndex?: number;
}

/**
 * Drop-in replacement for `cloneNodeSafe` that enriches any thrown error
 * with the call-site coordinates, making failures immediately locatable
 * without re-running with extra logging.
 *
 * Error message format (prefix appended):
 *   [fillCluster.bubble @ section=02 cluster=2] cloneNode: source not found: 184:10800
 */
async function tracedClone(
  backend: FigmaBackend,
  args: Parameters<typeof cloneNodeSafe>[1],
  trace: RenderTrace
): Promise<NodeInfo> {
  try {
    return await cloneNodeSafe(backend, args);
  } catch (e) {
    const err = e as Error & { code?: string };
    const parts = [`[${trace.callSite}`];
    if (trace.sectionIndex !== undefined) parts.push(` @ section=${trace.sectionIndex}`);
    if (trace.clusterIndex !== undefined) parts.push(` cluster=${trace.clusterIndex}`);
    parts.push('] ');
    err.message = parts.join('') + err.message;
    throw err;
  }
}

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
  | {
      type: 'figma_node';
      fileKey: string;
      nodeId: string;
      /** Region of the source node (its local coords). Omitted → whole node. */
      crop?: CropRect;
      /** Export scale. Default 1. */
      scale?: number;
    }
  /** Leave 主图占位 untouched; user will hand-drop an image later. */
  | { type: 'skip' }
  /**
   * Place a LIVE instance of a design master / pasted instance over 主图占位.
   * Unlike `figma_node`, nothing is rasterized: the document keeps a real
   * instance linked to its component, scaled into the placeholder.
   */
  | { type: 'figma_instance'; fileKey: string; nodeId: string };

export interface RenderInput {
  markdown: string;
  /**
   * Asset sources. Two key shapes:
   *   - `"NN"`      → main image of section NN. Missing → "skip".
   *   - `"NN/C/K"`  → K-th `配图：` (1-based) of cluster C (1-based) in
   *                   section NN. K counts every `配图：` in the cluster in
   *                   document order, continuing across `####` groups.
   *                   Only `figma_node` / `skip` are honoured.
   */
  assetMap?: Record<string, AssetSpec>;
  target?: {
    /**
     * File to render into. Omitted, the render lands in whatever file is
     * currently active in Figma Desktop.
     *
     * Passed, every backend call is routed to that connected file instead —
     * see `FigmaBackend.withFileKey`. This is the safe way to render while
     * the designer is working in a different file: the active file is not
     * switched and not written to.
     */
    fileKey?: string;
    /** Page to host the cloned template instance. If omitted, backend chooses. */
    pageId?: string;
    /**
     * Root of a document this engine rendered earlier. Passed, the render
     * syncs that document in place instead of cloning a new one.
     */
    rootId?: string;
  };
  /** Sync only: limit the sync to section `"NN"` or cluster `"NN/C"`. */
  scope?: string;
  /** Sync only: compute and report the plan without writing. */
  dryRun?: boolean;
  /**
   * Template to clone. Omitted, {@link resolveTemplateConfig} walks
   * env → `~/.game-interaction-sop/template.json` → default.
   */
  template?: Partial<TemplateRef>;
}

export interface RenderResult {
  ok: boolean;
  mode?: 'create' | 'reconcile';
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
    /** `配图` placeholders filled from `"NN/C/K"` assets. */
    figuresPlaced: number;
  };
  /** Sync only. */
  changes?: ReconcileChange[];
  conflicts?: ReconcileConflict[];
  preserved?: ReconcilePreserved[];
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

  // Phase A2 — Bind the target file, before anything touches the canvas.
  let targetBackend: FigmaBackend;
  try {
    targetBackend = await bindTargetFile(input, backend);
  } catch (e) {
    const err = e as Error & { code?: string };
    return {
      ok: false,
      errors: [{ code: err.code ?? 'V2_TARGET_FILE_ERROR', message: err.message }],
      warnings: parsed.warnings
    };
  }

  if (input.target?.rootId) {
    return reconcileV2(parsed.ir, parsed.warnings, input, targetBackend);
  }

  // Phase B — Render. Wrap in undo checkpoint + try/catch for one-shot rollback.
  const figures = makeFigureState(input.assetMap);
  const keyWarnings = findUnmatchedAssetKeys(parsed.ir, input.assetMap);
  const roleWarnings: SoftWarning[] = [];
  await targetBackend.commitUndoCheckpoint('v2-render-start');
  let rootInstanceId: string | undefined;
  try {
    rootInstanceId = await renderInner(
      parsed.ir,
      input,
      targetBackend,
      figures,
      (id) => { rootInstanceId = id; },   // set as soon as root is created
      (w) => roleWarnings.push(w)
    );
  } catch (e) {
    const err = e as Error & { code?: string };
    // Best-effort rollback: delete the entire root subtree if it was created.
    // More reliable than triggerUndo(1) which only undoes the last figma_execute
    // entry and leaves the rest of the partial render on canvas.
    if (rootInstanceId) {
      try {
        await targetBackend.deleteNodes([rootInstanceId]);
      } catch {
        /* root may already be partially cleaned up — ignore */
      }
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

  // Phase C — Stamp. A failure here leaves a usable document that simply
  // cannot be synced later, so it is a warning, never a rollback.
  const stampWarnings: SoftWarning[] = [];
  try {
    const { problems } = await stampRenderedDoc(targetBackend, rootInstanceId, parsed.ir, input.assetMap);
    for (const p of problems) {
      stampWarnings.push({ code: SOFT_WARNING_CODES.W_STAMP_LAYOUT_MISMATCH, message: p });
    }
  } catch (e) {
    stampWarnings.push({
      code: SOFT_WARNING_CODES.W_STAMP_FAILED,
      message: `document rendered but not stamped, so it cannot be synced later: ${(e as Error).message}`
    });
  }

  return {
    ok: true,
    mode: 'create',
    rootInstanceId,
    errors: [],
    warnings: [...parsed.warnings, ...keyWarnings, ...figures.warnings, ...stampWarnings, ...roleWarnings],
    summary: {
      ...summarize(parsed.ir, input.assetMap),
      figuresPlaced: figures.placed
    }
  };
}

// --- Target file binding -------------------------------------------------

/** Node types that a usable 1:14 template could plausibly be. */
const TEMPLATE_CONTAINER_TYPES: ReadonlyArray<NodeInfo['type']> = [
  'FRAME',
  'COMPONENT',
  'INSTANCE',
  'GROUP'
];

/**
 * Resolve which file the render writes into.
 *
 * `target.fileKey` used to be accepted by the tool schema, typed in
 * `RenderInput`, documented in the SOP — and then dropped on the floor. Every
 * render went to whatever file happened to be active in Figma Desktop. Since
 * `TEMPLATE_NODE_ID` is a bare `'1:14'`, pointing at the wrong file does not
 * fail loudly: that id resolves to some unrelated node (in one production file
 * it is a TEXT layer with two names on it) and the renderer starts cloning it.
 *
 * So when a fileKey is given we bind the backend to it and immediately probe
 * `1:14` in that file. A backend that cannot address files by key is a hard
 * error, never a silent fallback to the active file.
 *
 * No fileKey → unchanged behaviour, and crucially no extra backend calls.
 */
async function bindTargetFile(
  input: RenderInput,
  backend: FigmaBackend
): Promise<FigmaBackend> {
  const fileKey = input.target?.fileKey;
  if (!fileKey) return backend;

  if (!backend.withFileKey) {
    throw Object.assign(
      new Error(
        `target.fileKey=${fileKey} was requested but this backend cannot address ` +
          `files by key, so the render would silently land in whichever file is ` +
          `active. Drop target.fileKey to render into the active file.`
      ),
      { code: 'V2_TARGET_FILE_UNSUPPORTED' }
    );
  }

  const bound = backend.withFileKey(fileKey);
  const template = resolveTemplateConfig(input.template);

  // Library mode: the template lives in a published library, not in the target
  // file. Nothing to probe — the node id would resolve to an unrelated node in
  // whatever file happens to be open.
  if (template.componentKey) return bound;

  const templateNodeId = template.nodeId ?? DEFAULT_TEMPLATE.nodeId;

  let templateNode: NodeInfo;
  try {
    templateNode = await bound.getNodeInfo(templateNodeId);
  } catch (e) {
    throw Object.assign(
      new Error(
        `cannot read template node ${templateNodeId} in file ${fileKey}: ` +
          `${(e as Error).message}. Is the Desktop Bridge plugin running in that file?`
      ),
      { code: 'V2_TARGET_FILE_UNREACHABLE' }
    );
  }

  if (
    !TEMPLATE_CONTAINER_TYPES.includes(templateNode.type) ||
    !templateNode.childIds ||
    templateNode.childIds.length === 0
  ) {
    throw Object.assign(
      new Error(
        `node ${templateNodeId} in file ${fileKey} is a ${templateNode.type} ` +
          `named "${templateNode.name}" with no children — that is not the template. ` +
          `Expected node ${templateNodeId} (see ~/.game-interaction-sop/template.json).`
      ),
      { code: 'V2_TEMPLATE_NODE_MISMATCH' }
    );
  }

  return bound;
}

// --- Inner renderer ------------------------------------------------------

export async function renderInner(
  ir: DocIR,
  input: RenderInput,
  backend: FigmaBackend,
  figures: FigureState,
  onRootCreated?: (id: string) => void,
  report?: (w: SoftWarning) => void
): Promise<string> {
  // 1. Clone master template into target page.
  const template = resolveTemplateConfig(input.template);
  const seenWarnings = new Set<string>();
  const warnRoleBlock = (message: string) => {
    if (seenWarnings.has(message)) return;
    seenWarnings.add(message);
    report?.({ code: SOFT_WARNING_CODES.W_ROLE_BLOCK_MISSING, message });
  };
  const roleBlocks = await loadRoleBlocks(backend, template.roleBlock, warnRoleBlock);
  assertRoleBlocksAvailable(ir, roleBlocks);
  let root: NodeInfo;
  if (template.componentKey) {
    if (!backend.instantiateByKey) {
      throw Object.assign(
        new Error('当前 Figma 后端不支持库引用模式（instantiateByKey）'),
        { code: 'V2_LIBRARY_UNSUPPORTED' }
      );
    }
    root = await backend.instantiateByKey({
      componentKey: template.componentKey,
      parentId: input.target?.pageId,
      name: ir.header.title
    });
    // Figma refuses structural edits (cloning 说明块, appending bullets) inside
    // an instance, and imported library instances are the strictest. Detach the
    // root so the rest of the renderer can keep treating it as a plain frame.
    // NOTE: detach replaces the node — the frame has a different id.
    if (backend.detachInstance) root = await backend.detachInstance(root.id);
  } else {
    root = await tracedClone(
      backend,
      {
        sourceId: template.nodeId ?? DEFAULT_TEMPLATE.nodeId,
        parentId: input.target?.pageId,
        name: ir.header.title
      },
      { callSite: 'template.root' }
    );
  }
  // Expose root.id immediately so the outer catch can delete it on failure.
  onRootCreated?.(root.id);

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
    const section = ir.sections[i];
    const clone = await tracedClone(
      backend,
      {
        sourceId: masterSectionGroup.id, // ← still blank at this point
        parentId: parentOfSections,
        name: `界面说明${i + 1}`
      },
      { callSite: 'phase1.master', sectionIndex: section?.index }
    );
    sectionNodes.push(clone);
  }

  // Phase 2 — Render each section into its pre-cloned node.
  for (let i = 0; i < ir.sections.length; i++) {
    const section = ir.sections[i];
    const sectionNode = sectionNodes[i];
    if (!section || !sectionNode) continue;

    await renderSection(
      backend,
      sectionNode,
      section,
      input.assetMap?.[section.index],
      figures,
      roleBlocks
    );

    if (input.assetMap?.[section.index]?.type === 'image') imagesPlaced++;
    else placeholdersUsed++;
  }

  return root.id;
}

function requireInstantiateByKey(
  backend: FigmaBackend
): NonNullable<FigmaBackend['instantiateByKey']> {
  if (!backend.instantiateByKey) {
    throw Object.assign(
      new Error('当前 Figma 后端不支持按库 key 实例化组件（instantiateByKey）'),
      { code: 'V2_LIBRARY_UNSUPPORTED' }
    );
  }
  return backend.instantiateByKey.bind(backend);
}

function requireInstantiateComponent(
  backend: FigmaBackend
): NonNullable<FigmaBackend['instantiateComponent']> {
  if (!backend.instantiateComponent) {
    throw Object.assign(
      new Error('当前 Figma 后端不支持组件实例化（instantiateComponent），无法渲染 @职能 条目'),
      { code: 'V2_ROLE_BLOCK_UNAVAILABLE' }
    );
  }
  return backend.instantiateComponent.bind(backend);
}

/**
 * `- @职能：…` needs the 职能标记 component set. Without it the bullet would
 * become a plain TEXT, the create-mode stamp would no longer line up with the
 * canvas and the document could never be synced — so fail loudly instead.
 */
function assertRoleBlocksAvailable(
  ir: DocIR,
  roleBlocks: RoleBlockRuntime | undefined
): void {
  if (roleBlocks) return;
  const hasRoleBullet = ir.sections.some((s) =>
    s.clusters.some((c) => c.bullets.some((b) => parseRoleBullet(b) !== undefined))
  );
  if (!hasRoleBullet) return;
  throw Object.assign(
    new Error(
      'Markdown 里有 `- @职能：…` 条目，但模板未配置「职能标记」组件集。' +
        '在 ~/.game-interaction-sop/template.json（或 config.local.json）里填 roleBlock.componentSetId，' +
        '并把组件集放进模板文件后重试。'
    ),
    { code: 'V2_ROLE_BLOCK_UNAVAILABLE' }
  );
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
// Bug 3 [FIXED]: 配图占位处理必须双向——需要+没有时从兄弟块克隆补上；不需要+有时删除。
//               2026-10-16 (engine-inline-multi-figure)：每条 `配图：` 各一个 GROUP，
//               按 bullet 顺序原位穿插，一块可多张；旧版"保留首个、只写首条描述"已移除。
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
  asset: AssetSpec | undefined,
  figures: FigureState,
  roleBlocks: RoleBlockRuntime | undefined
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

  // One 说明块 per cluster. `####` sub-groups do NOT get their own block —
  // they are rendered as repeated slot runs INSIDE the cluster's block, so
  // the block budget here is exactly the cluster count (see fillGroupSlots).
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
  const imageSeed = makeImageSeed(await findSeedImageGroup(backend, sectionNode.id));

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
      imageSeed,
      section.index,
      i,
      figures,
      roleBlocks
    );
    if (bubble) bubbleNodes.push(bubble);
  }

  // Every cluster has had its shot at cloning the seed 配图; it can go now.
  await imageSeed.flush(backend);

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

/** True when the cluster carries no `####` at all — the fast path. */
function isSingleDefaultGroup(cluster: SemanticCluster): boolean {
  return cluster.groups.length <= 1 && (cluster.groups[0]?.title ?? null) === null;
}

/**
 * A section-scoped clone source for the 配图 GROUP, with a stay of execution.
 *
 * The template's only 配图 lives inside 说明块01, i.e. inside the block that
 * cluster 0 renders into. 说明块02 ships without one, so any later cluster that
 * declares `配图：` has to clone this seed. That put the seed on a collision
 * course with its own block: when cluster 0 needs no image, the reconciliation
 * step deleted every 配图 in the block — the seed included — and the next
 * cluster's clone hit `cloneNode: source not found`, failing the whole render.
 *
 * So deletions are routed through `filterDeletes`: the seed is skipped and
 * merely marked doomed, then `flush` removes it once every cluster in the
 * section has been filled. The seed lingers on canvas for the duration of the
 * cluster loop only; the final state is identical to deleting it in place.
 */
interface ImageSeed {
  /** 配图 GROUP to clone from, or undefined when the section has none. */
  readonly id: string | undefined;
  /** Drop the seed from a delete batch, remembering that it should still die. */
  filterDeletes(ids: string[]): string[];
  /** Delete the seed if some cluster asked for it. Call after the cluster loop. */
  flush(backend: FigmaBackend): Promise<void>;
}

function makeImageSeed(id: string | undefined): ImageSeed {
  let doomed = false;
  return {
    id,
    filterDeletes(ids) {
      if (id === undefined) return ids;
      const kept = ids.filter((x) => x !== id);
      if (kept.length !== ids.length) doomed = true;
      return kept;
    },
    async flush(backend) {
      if (doomed && id !== undefined) {
        await backend.deleteNodes([id]);
      }
    }
  };
}

// --- Figure assets (`"NN/C/K"` keys) -------------------------------------

type FigmaNodeAsset = Extract<AssetSpec, { type: 'figma_node' }>;

/** Column width of the 1:14 说明块, used if the block's bbox is unavailable. */
const FIGURE_MAX_WIDTH_FALLBACK = 1231;

const SECTION_KEY_RE = /^\d{2}$/;
const FIGURE_KEY_RE = /^(\d{2})\/(\d+)\/(\d+)$/;

/** Render-wide bookkeeping for figure assets and text-write side effects. */
export interface FigureState {
  /** Asset for figure K of cluster `prefix` ("NN/C"), if the caller gave one. */
  lookup(prefix: string, ordinal: number): AssetSpec | undefined;
  warn(key: string, message: string): void;
  /** Record families that had no bold weight for state lines (warned once each). */
  textWritten(r: TextWriteResult): void;
  placed: number;
  readonly warnings: SoftWarning[];
}

export function makeFigureState(assetMap: Record<string, AssetSpec> | undefined): FigureState {
  const warnings: SoftWarning[] = [];
  const boldMissing = new Set<string>();
  return {
    lookup: (prefix, ordinal) => assetMap?.[`${prefix}/${ordinal}`],
    warn(key, message) {
      warnings.push({ code: SOFT_WARNING_CODES.W_FIGURE_FILL_FAILED, message, context: key });
    },
    textWritten(r) {
      for (const family of r.boldUnavailable) {
        if (boldMissing.has(family)) continue;
        boldMissing.add(family);
        warnings.push(boldUnavailableWarning(family));
      }
    },
    placed: 0,
    warnings
  };
}

export function boldUnavailableWarning(family: string): SoftWarning {
  return {
    code: SOFT_WARNING_CODES.W_STATE_BOLD_UNAVAILABLE,
    message: `字体族 ${family} 没有可用的粗体字重，状态名未加粗`,
    context: family
  };
}

/** `("01", 0)` → `"01/1"` — section index + 1-based cluster number. */
function figureKeyPrefix(sectionIndex: string, clusterIndex: number): string {
  return `${sectionIndex}/${clusterIndex + 1}`;
}

/**
 * Every assetMap key must point at something in the document: `"NN"` at an
 * existing section, `"NN/C/K"` at the K-th `配图：` of cluster C in section NN.
 * Anything else is reported, never fatal — a typo should not cost the render.
 */
function findUnmatchedAssetKeys(
  ir: DocIR,
  assetMap: Record<string, AssetSpec> | undefined
): SoftWarning[] {
  if (!assetMap) return [];
  const out: SoftWarning[] = [];
  for (const key of Object.keys(assetMap)) {
    let matched = false;
    if (SECTION_KEY_RE.test(key)) {
      matched = ir.sections.some((s) => s.index === key);
    } else {
      const m = FIGURE_KEY_RE.exec(key);
      if (m) {
        const section = ir.sections.find((s) => s.index === m[1]);
        const cluster = section?.clusters[Number(m[2]) - 1];
        const k = Number(m[3]);
        const figureCount = cluster ? cluster.bullets.filter(isImageBullet).length : 0;
        matched = k >= 1 && k <= figureCount;
      }
    }
    if (!matched) {
      out.push({
        code: SOFT_WARNING_CODES.W_ASSET_KEY_UNMATCHED,
        message: `assetMap["${key}"] does not match any section ("NN") or 配图 ("NN/C/K") in the document`,
        context: key
      });
    }
  }
  return out;
}

async function fillCluster(
  backend: FigmaBackend,
  clusterNode: NodeInfo,
  cluster: SemanticCluster,
  bubbleFrame: NodeInfo | undefined,
  bubbleNumber: number,
  imageSeed: ImageSeed,
  sectionIndex: string,
  clusterIndex: number,
  figures: FigureState,
  roleBlocks: RoleBlockRuntime | undefined
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

  const singleDefault = isSingleDefaultGroup(cluster);

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

  // #Title — the sub-group heading slot. The template ships 2 instances
  // ("小标题1 / 小标题2"), one per slot run.
  //   - no `####` in the markdown → nothing to write, so ALL instances are
  //     deleted; otherwise the literal placeholder text leaks into the doc.
  //   - with `####`               → fillGroupSlots owns them; leave alone.
  if (singleDefault) {
    const subTitles = allDescendants.filter(
      (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterSubTitle
    );
    if (subTitles.length > 0) {
      await backend.deleteNodes(subTitles.map((n) => n.id));
    }
  }

  // Role tags (Bug 9): template carries one "Frame 4273..." role frame per
  // slot run. The flat path collapses them to a single frame; the grouped
  // path keeps slot 1's frame and lets fillGroupSlots drop the followers'
  // (the @roles line is cluster-level, so repeating it per sub-group would
  // just be noise).
  const roleFrames = allDescendants.filter(
    (n) =>
      n.type === 'FRAME' && n.name.startsWith(SECTION_CHILD_NAMES.roleTagsFramePrefix)
  );
  if (singleDefault && roleFrames.length > 1) {
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

  if (singleDefault) {
    await fillBlockContent(backend, {
      blockId: clusterNode.id,
      allDescendants,
      bullets: cluster.bullets,
      imageSeed,
      sectionIndex,
      clusterIndex,
      figures,
      roleBlocks
    });
  } else {
    await fillGroupSlots(backend, clusterNode, cluster, {
      imageSeed,
      sectionIndex,
      clusterIndex,
      figures,
      roleBlocks
    });
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
    myBubble = await tracedClone(
      backend,
      { sourceId: sourceBubble.id, parentId: bubbleFrame.id },
      { callSite: 'fillCluster.bubble', sectionIndex, clusterIndex }
    );
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

interface FillBlockContentParams {
  /** The 说明块 FRAME whose contents are being written. */
  blockId: string;
  /** Pre-scanned descendants of `blockId`. Never re-scanned here. */
  allDescendants: NodeInfo[];
  /** The bullets belonging to this block (one group's worth, or the whole cluster). */
  bullets: string[];
  imageSeed: ImageSeed;
  sectionIndex: string;
  clusterIndex: number;
  figures: FigureState;
  roleBlocks: RoleBlockRuntime | undefined;
}

/**
 * Write one flat (no-`####`) 说明块's bullet list and reconcile its 配图占位.
 *
 * Blocks with no `配图：` keep the original in-place path, call for call, so
 * image-free documents render exactly as before. Blocks with any `配图：` go
 * through fillBlockContentInline, which places each image after the rule it
 * illustrates.
 */
async function fillBlockContent(
  backend: FigmaBackend,
  p: FillBlockContentParams
): Promise<void> {
  const { allDescendants, bullets, imageSeed } = p;

  const bulletTexts = allDescendants.filter(
    (n) =>
      n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterBulletText
  );

  if (bullets.some(isImageBullet) || bullets.some((b) => parseRoleBullet(b) !== undefined)) {
    await fillBlockContentInline(backend, p, bulletTexts);
    return;
  }

  // Bullets: 1 TEXT ("正文/规则") = 1 bullet. Clone or trim to match count.
  const visibleBullets = bullets;
  const bulletNodes: NodeInfo[] = bulletTexts.slice(0, visibleBullets.length);
  const bulletSource = bulletTexts[0];
  // PR-2 (backend-batch-clone-nodes): replace serial while-loop with single
  // batchCloneNodes call. Original while-loop left as reference comment:
  //   while (bulletNodes.length < visibleBullets.length && bulletSource) {
  //     const clone = await cloneNodeSafe(backend, { sourceId: bulletSource.id, parentId: bulletSource.parentId });
  //     bulletNodes.push(clone);
  //   }
  const bulletNeeded = visibleBullets.length - bulletNodes.length;
  if (bulletNeeded > 0 && bulletSource?.parentId) {
    const newBullets = await backend.batchCloneNodes({
      sourceId: bulletSource.id,
      parentId: bulletSource.parentId,
      count: bulletNeeded
    });
    bulletNodes.push(...newBullets);
  }
  if (bulletTexts.length > visibleBullets.length) {
    await backend.deleteNodes(
      bulletTexts.slice(visibleBullets.length).map((n) => n.id)
    );
  }
  const bulletUpdates: TextUpdate[] = [];
  for (let i = 0; i < visibleBullets.length; i++) {
    const node = bulletNodes[i];
    const raw = visibleBullets[i] ?? '';
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
      bulletUpdates.push({ nodeId: node.id, characters: body, bold: stateBoldLength(body) });
    }
  }
  if (bulletUpdates.length > 0) {
    p.figures.textWritten(await backend.setMultipleTextContents(bulletUpdates));
  }

  // No 配图 wanted here: drop the template's (the section seed survives
  // until ImageSeed.flush).
  const existingImageGroups = allDescendants.filter(
    (n) => n.type === 'GROUP' && n.name === SECTION_CHILD_NAMES.optionalImagePlaceholder
  );
  if (existingImageGroups.length > 0) {
    const doomed = imageSeed.filterDeletes(existingImageGroups.map((n) => n.id));
    if (doomed.length > 0) await backend.deleteNodes(doomed);
  }
}

/**
 * Flat-path rendering for a block that declares at least one `配图：`.
 *
 * `配图` must sit right after the rule it illustrates, and a block may carry
 * several. Reusing the template's in-place TEXTs (the image-free path) cannot
 * honour that: the template interleaves `正文 正文 配图 … 正文 正文 配图`, so the
 * kept nodes land wherever the template happened to put them. Instead this
 * uses the same build-then-delete strategy as fillGroupSlots: append every
 * 正文/配图 in bullet order, then delete the template's originals.
 */
async function fillBlockContentInline(
  backend: FigmaBackend,
  p: FillBlockContentParams,
  bulletTexts: NodeInfo[]
): Promise<void> {
  const { blockId, allDescendants, bullets, imageSeed, sectionIndex, clusterIndex, figures } = p;

  const directImageGroups = allDescendants.filter(
    (n) =>
      n.type === 'GROUP' &&
      n.name === SECTION_CHILD_NAMES.optionalImagePlaceholder &&
      n.parentId === blockId
  );
  const directBulletTexts = bulletTexts.filter((n) => n.parentId === blockId);

  const appended = await appendBulletsInOrder(backend, {
    parentId: blockId,
    bullets,
    protoBulletId: directBulletTexts[0]?.id,
    protoImageId: directImageGroups[0]?.id ?? imageSeed.id,
    ordinal: { next: 1 },
    trace: { callSite: 'fillCluster.inlineImage', sectionIndex, clusterIndex },
    roleBlocks: p.roleBlocks
  });

  const originals = imageSeed.filterDeletes([
    ...directBulletTexts.map((n) => n.id),
    ...directImageGroups.map((n) => n.id)
  ]);
  if (originals.length > 0) await backend.deleteNodes(originals);

  await finishBlockFigures(backend, {
    blockId,
    textUpdates: appended.textUpdates,
    images: appended.images,
    figures,
    keyPrefix: figureKeyPrefix(sectionIndex, clusterIndex)
  });
}

interface AppendedImage {
  groupId: string;
  desc: string;
  /** 1-based position among the cluster's `配图：` bullets (spans `####`). */
  ordinal: number;
}

interface AppendedBullets {
  textUpdates: TextUpdate[];
  images: AppendedImage[];
}

/**
 * Append 正文/规则 TEXTs and 配图 GROUPs to `parentId` in bullet order.
 *
 * Consecutive rule bullets share one batchCloneNodes call; each `配图：`
 * costs one cloneNode. For a run with no image, or a single image at the
 * end, that is exactly the call pattern fillGroupSlots used before.
 * Text and hint content are returned, not written — callers batch them.
 *
 * `ordinal` is shared across calls for one cluster so that K in the
 * `"NN/C/K"` asset key keeps counting through `####` groups.
 */
async function appendBulletsInOrder(
  backend: FigmaBackend,
  p: {
    parentId: string;
    bullets: string[];
    protoBulletId: string | undefined;
    protoImageId: string | undefined;
    ordinal: { next: number };
    trace: RenderTrace;
    roleBlocks: RoleBlockRuntime | undefined;
  }
): Promise<AppendedBullets> {
  const out: AppendedBullets = { textUpdates: [], images: [] };
  let pending: string[] = [];

  const flushRules = async () => {
    if (pending.length === 0 || !p.protoBulletId) {
      pending = [];
      return;
    }
    const cloned = await backend.batchCloneNodes({
      sourceId: p.protoBulletId,
      parentId: p.parentId,
      count: pending.length
    });
    for (let j = 0; j < pending.length; j++) {
      const node = cloned[j];
      if (node) {
        const characters = normalizeBulletText(pending[j] ?? '');
        out.textUpdates.push({ nodeId: node.id, characters, bold: stateBoldLength(characters) });
      }
    }
    pending = [];
  };

  for (const bullet of p.bullets) {
    const roleBullet = parseRoleBullet(bullet);
    if (roleBullet) {
      await flushRules();
      const variantId = p.roleBlocks?.variants.get(roleBullet.role);
      const variantKey = p.roleBlocks?.variantKeys?.get(roleBullet.role);
      if (!p.roleBlocks || (!variantId && !variantKey)) {
        throw Object.assign(
          new Error(
            `「职能标记」组件里没有 @${roleBullet.role} 对应的变体（期望名称："${p.roleBlocks?.config.variantPrefix ?? '职能标记='}#${roleBullet.role}"）`
          ),
          { code: 'V2_ROLE_BLOCK_UNAVAILABLE' }
        );
      }
      const instanceName = `${p.roleBlocks.config.variantPrefix}${roleBullet.role}`;
      const instance = variantKey
        ? await requireInstantiateByKey(backend)({
            componentKey: variantKey,
            parentId: p.parentId,
            name: instanceName
          })
        : await requireInstantiateComponent(backend)({
            componentId: variantId!,
            parentId: p.parentId,
            name: instanceName
          });
      const bodyId = await findRoleBlockBody(
        backend,
        instance.id,
        p.roleBlocks.config.labelTextName
      );
      if (bodyId) out.textUpdates.push({ nodeId: bodyId, characters: roleBullet.text });
      continue;
    }
    if (!isImageBullet(bullet)) {
      pending.push(bullet);
      continue;
    }
    const ordinal = p.ordinal.next++;
    await flushRules();
    if (!p.protoImageId) continue;
    const imageNode = await tracedClone(
      backend,
      { sourceId: p.protoImageId, parentId: p.parentId },
      p.trace
    );
    out.images.push({ groupId: imageNode.id, desc: stripImageBulletPrefix(bullet), ordinal });
  }
  await flushRules();

  return out;
}

/**
 * Last step of composing a 说明块: write body texts + 配图 hints in one
 * batch, then fill every 配图 that has an `"NN/C/K"` asset.
 *
 * One scan of the block resolves each new 配图 GROUP's RECTANGLE and hint
 * TEXT. Figures with an asset skip the hint text (the fill deletes it).
 * A failed fill never aborts the render: it records W_FIGURE_FILL_FAILED
 * and writes the hint text back so the placeholder still says what goes there.
 *
 * With no figure assets in play the call pattern is exactly the old one:
 * at most one scanSubtree plus one setMultipleTextContents.
 */
async function finishBlockFigures(
  backend: FigmaBackend,
  p: {
    blockId: string;
    textUpdates: TextUpdate[];
    images: AppendedImage[];
    figures: FigureState;
    keyPrefix: string;
  }
): Promise<void> {
  const updates = [...p.textUpdates];
  const toFill: Array<{ img: AppendedImage; key: string; asset: FigmaNodeAsset }> = [];
  const parts = new Map<string, { rectId?: string; hintId?: string }>();
  let blockWidth: number | undefined;

  const needScan = p.images.some((img) => img.desc || p.figures.lookup(p.keyPrefix, img.ordinal));
  if (needScan) {
    const { nodes: scanned, truncated } = await backend.scanSubtree(p.blockId);
    const all = truncated ? await scanAllDescendants(backend, p.blockId) : scanned;
    for (const n of all) {
      if (n.id === p.blockId) blockWidth = n.absoluteBoundingBox?.width;
      if (!n.parentId) continue;
      const entry = parts.get(n.parentId) ?? {};
      if (n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.optionalImagePlaceholderHint) {
        entry.hintId ??= n.id;
      } else if (n.type === 'RECTANGLE' && n.name === SECTION_CHILD_NAMES.optionalImageRect) {
        entry.rectId ??= n.id;
      }
      parts.set(n.parentId, entry);
    }
  }

  for (const img of p.images) {
    const key = `${p.keyPrefix}/${img.ordinal}`;
    const asset = p.figures.lookup(p.keyPrefix, img.ordinal);
    if (asset?.type === 'figma_node') {
      toFill.push({ img, key, asset });
      continue;
    }
    if (asset && asset.type !== 'skip') {
      p.figures.warn(key, `assetMap["${key}"] type "${asset.type}" is not supported for 配图; only figma_node / skip`);
    }
    const hintId = parts.get(img.groupId)?.hintId;
    if (hintId && img.desc) updates.push({ nodeId: hintId, characters: `配图占位：${img.desc}` });
  }

  if (updates.length > 0) p.figures.textWritten(await backend.setMultipleTextContents(updates));

  for (const { img, key, asset } of toFill) {
    const { rectId, hintId } = parts.get(img.groupId) ?? {};
    try {
      if (!backend.fillFigurePlaceholder) {
        throw new Error('backend lacks fillFigurePlaceholder');
      }
      if (!rectId) {
        throw new Error(`配图 GROUP ${img.groupId} has no "${SECTION_CHILD_NAMES.optionalImageRect}" RECTANGLE`);
      }
      await backend.fillFigurePlaceholder({
        sourceNodeId: asset.nodeId,
        groupId: img.groupId,
        rectId,
        hintId,
        crop: asset.crop,
        scale: asset.scale,
        maxWidth: blockWidth ?? FIGURE_MAX_WIDTH_FALLBACK
      });
      p.figures.placed++;
    } catch (e) {
      p.figures.warn(key, `assetMap["${key}"] nodeId=${asset.nodeId}: ${(e as Error).message}`);
      if (hintId && img.desc) {
        try {
          await backend.setTextContent(hintId, `配图占位：${img.desc}`);
        } catch {
          /* hint may be gone with a half-applied fill — nothing else to do */
        }
      }
    }
  }
}

/**
 * Render a cluster that uses `####` sub-groups.
 *
 * The 1:14 说明块 is not one flat body — it is a header plus a repeating
 * SLOT RUN, and the template ships two of them:
 *
 *   标题(GROUP)                                   ← cluster identity, once
 *   #Title  Frame4273  正文/规则×2  配图           ← slot run 1
 *   #Title  Frame4273  正文/规则×2  配图           ← slot run 2
 *
 * So a `####` sub-group is a slot run inside ONE block, not a block of its
 * own. The header is left untouched: one cluster owns exactly one numbered
 * bubble on the main image, so its badge and title must appear exactly once.
 *
 * Composition strategy — every slot is rebuilt by cloning the template's
 * first run, then the original runs are deleted:
 *
 *   [orig1, orig2] → [orig1, orig2, new1..newN] → delete orig → [new1..newN]
 *
 * Cloning append-only is the whole reason for this order. The block is an
 * AUTO_LAYOUT stack, so a node cloned into it always lands at the bottom;
 * building the runs in document order and deleting the prototypes afterwards
 * is what makes the final stacking order come out right. It also lets each
 * run be composed to exact size (N bullet TEXTs, 配图 only where a `配图：`
 * bullet asked for it) instead of cloned-then-trimmed.
 *
 * The role-tags frame is cloned for the first group only: `@roles` is
 * declared once per `###`, so repeating the same tag row above every
 * sub-group would be pure noise.
 */
async function fillGroupSlots(
  backend: FigmaBackend,
  clusterNode: NodeInfo,
  cluster: SemanticCluster,
  ctx: {
    imageSeed: ImageSeed;
    sectionIndex: string;
    clusterIndex: number;
    figures: FigureState;
    roleBlocks: RoleBlockRuntime | undefined;
  }
): Promise<void> {
  const blockInfo = await backend.getNodeInfo(clusterNode.id);
  const children = blockInfo.childIds
    ? await backend.getNodesInfo(blockInfo.childIds)
    : [];

  const runs = splitSlotRuns(children);
  const prototype = runs[0];
  if (!prototype) {
    // Non-canonical block with no `#Title` at all — nothing to slot on.
    // Fall back to rendering the cluster flat so content is never lost.
    const { nodes } = await backend.scanSubtree(clusterNode.id);
    await fillBlockContent(backend, {
      blockId: clusterNode.id,
      allDescendants: nodes,
      bullets: cluster.bullets,
      imageSeed: ctx.imageSeed,
      sectionIndex: ctx.sectionIndex,
      clusterIndex: ctx.clusterIndex,
      figures: ctx.figures,
      roleBlocks: ctx.roleBlocks
    });
    return;
  }

  const protoTitle = prototype.find(
    (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterSubTitle
  );
  const protoRoleFrame = prototype.find(
    (n) =>
      n.type === 'FRAME' && n.name.startsWith(SECTION_CHILD_NAMES.roleTagsFramePrefix)
  );
  const protoBullet = prototype.find(
    (n) => n.type === 'TEXT' && n.name === SECTION_CHILD_NAMES.clusterBulletText
  );
  const protoImage =
    prototype.find(
      (n) =>
        n.type === 'GROUP' && n.name === SECTION_CHILD_NAMES.optionalImagePlaceholder
    ) ??
    (ctx.imageSeed.id ? ({ id: ctx.imageSeed.id } as NodeInfo) : undefined);

  const textUpdates: TextUpdate[] = [];
  const images: AppendedImage[] = [];
  const ordinal = { next: 1 };

  for (let i = 0; i < cluster.groups.length; i++) {
    const group = cluster.groups[i];
    if (!group) continue;

    if (group.title !== null && protoTitle) {
      const titleNode = await tracedClone(
        backend,
        { sourceId: protoTitle.id, parentId: clusterNode.id },
        { callSite: 'fillGroupSlots.title', sectionIndex: ctx.sectionIndex, clusterIndex: ctx.clusterIndex }
      );
      textUpdates.push({ nodeId: titleNode.id, characters: group.title });
    }

    if (i === 0 && protoRoleFrame) {
      await tracedClone(
        backend,
        { sourceId: protoRoleFrame.id, parentId: clusterNode.id },
        { callSite: 'fillGroupSlots.roleFrame', sectionIndex: ctx.sectionIndex, clusterIndex: ctx.clusterIndex }
      );
    }

    const appended = await appendBulletsInOrder(backend, {
      parentId: clusterNode.id,
      bullets: group.bullets,
      protoBulletId: protoBullet?.id,
      protoImageId: protoImage?.id,
      ordinal,
      trace: { callSite: 'fillGroupSlots.image', sectionIndex: ctx.sectionIndex, clusterIndex: ctx.clusterIndex },
      roleBlocks: ctx.roleBlocks
    });
    textUpdates.push(...appended.textUpdates);
    images.push(...appended.images);
  }

  // Prototypes have served their purpose; drop every original run so only
  // the freshly composed ones remain. The 标题 header is not part of any
  // run and therefore survives — and so does the section's seed 配图 if it
  // happens to live in one of these runs (see ImageSeed).
  const originalIds = ctx.imageSeed.filterDeletes(runs.flat().map((n) => n.id));
  if (originalIds.length > 0) {
    await backend.deleteNodes(originalIds);
  }

  await finishBlockFigures(backend, {
    blockId: clusterNode.id,
    textUpdates,
    images,
    figures: ctx.figures,
    keyPrefix: figureKeyPrefix(ctx.sectionIndex, ctx.clusterIndex)
  });
}

/**
 * Split a 说明块's direct children into slot runs.
 *
 * A run starts at each `#Title` TEXT and extends to the node before the next
 * one. Anything before the first `#Title` is the cluster header (标题 GROUP)
 * and is deliberately excluded — callers must never clone or delete it.
 */
function splitSlotRuns(children: NodeInfo[]): NodeInfo[][] {
  const runs: NodeInfo[][] = [];
  let current: NodeInfo[] | undefined;
  for (const child of children) {
    const isTitle =
      child.type === 'TEXT' && child.name === SECTION_CHILD_NAMES.clusterSubTitle;
    if (isTitle) {
      current = [child];
      runs.push(current);
    } else if (current) {
      current.push(child);
    }
  }
  return runs;
}

/** `- **文本**` → `文本`. The template TEXT does not interpret markdown. */
function normalizeBulletText(raw: string): string {
  return raw
    .replace(/^\s*[-·•*]+\s*/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .trim();
}

/** `- 配图：低血量示意` → `低血量示意`. */
function stripImageBulletPrefix(raw: string): string {
  return raw
    .replace(/^\s*[-·•*]+\s*/, '')
    .replace(/^配图\s*[：:]\s*/u, '')
    .trim();
}

/**
 * Locate a seed 配图 GROUP anywhere under the section, to use as a clone
 * source for clusters whose template block shipped without one. Falls back
 * to `undefined` if none exists (caller must decide whether to warn).
 */async function findSeedImageGroup(
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

export async function applyAsset(
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
          scale: asset.scale ?? 1, // Bug 7: default SCALE=1
          crop: asset.crop
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
    case 'figma_instance':
      if (backend.placeInstance) {
        await backend.placeInstance({
          sourceId: asset.nodeId,
          placeholderId: mainPlaceholder.id
        });
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

function summarize(
  ir: DocIR,
  assetMap?: Record<string, AssetSpec>
): Omit<NonNullable<RenderResult['summary']>, 'figuresPlaced'> {
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
void ROLE_TEXT_ORDER;
void SECTION_TEMPLATE;
void HEADER_SLOTS;
void OVERVIEW_SLOTS;
void FigmaSafetyError;
