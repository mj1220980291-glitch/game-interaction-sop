/**
 * v2 Figma client — thin abstraction over a "figma-console MCP backend".
 *
 * The engine never speaks to Figma directly. Callers (the MCP host that
 * boots `createServer({ backend })`) wire a backend object that knows how
 * to call figma-console MCP tools (`figma_execute`, `figma_clone_node`,
 * `figma_set_text_content`, `get_node_info`, etc.).
 *
 * This file:
 *   1. Defines the minimal `FigmaBackend` interface the renderer needs.
 *   2. Provides safety wrappers that enforce the rules from
 *      docs/figma-mcp-pitfalls.md:
 *        - never move_node a GROUP child
 *        - FRAME-local coord conversion for bubble placement
 *        - undo checkpoint before risky batches
 *        - single-point probe before bulk batch
 *
 * Renderer code (`render.ts`) calls THIS module, not the backend directly.
 */

import {
  MAIN_IMAGE_SIZE,
  ROLE_TEXT_ORDER
} from './template-map.js';

// --- Types ---------------------------------------------------------------

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FigmaNodeType =
  | 'FRAME'
  | 'GROUP'
  | 'TEXT'
  | 'COMPONENT'
  | 'INSTANCE'
  | 'RECTANGLE'
  | 'PAGE'
  | 'OTHER';

export interface NodeInfo {
  id: string;
  name: string;
  type: FigmaNodeType;
  /** Absolute (PAGE-origin) bounding box. */
  absoluteBoundingBox?: BoundingBox;
  /** Parent ID, when known. */
  parentId?: string;
  /** Parent type, when known — needed for coord-system safety. */
  parentType?: FigmaNodeType;
  /** Direct children IDs (1 level only). */
  childIds?: string[];
  /** TEXT only: the rendered characters. */
  characters?: string;
  /**
   * `node.visible`. Undefined when the backend could not report it (older
   * backends and test doubles) — callers must treat undefined as visible.
   */
  visible?: boolean;
}

/**
 * Result of a single-RTT subtree scan.
 * @see FigmaBackend.scanSubtree
 */
/** A region of a node, in that node's local coordinates (top-left origin). */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScanSubtreeResult {
  /** Flat array of all nodes in the subtree (BFS order, root included). */
  nodes: NodeInfo[];
  /**
   * True when the scan hit the `maxNodes` budget and stopped early.
   * Callers should fall back to the multi-RTT `scanAllDescendants` helper.
   */
  truncated: boolean;
}

/**
 * Backend the host must wire. Each method maps roughly 1:1 to a
 * figma-console MCP tool but with sane typing. Implementations are
 * expected to be async and may throw. The engine wraps every call to
 * preserve the safety rules.
 */
export interface FigmaBackend {
  /**
   * Return a view of this backend whose every operation targets `fileKey`
   * instead of whatever file is active in Figma Desktop.
   *
   * Optional because not every backend can address files independently (the
   * test mock can't, and figma-console's Cloud Mode rejects `fileKey`). The
   * renderer treats a missing implementation as a hard error rather than
   * silently falling back to the active file — writing a document into the
   * wrong file is exactly the failure this exists to prevent.
   */
  withFileKey?(fileKey: string): FigmaBackend;

  /** Read a single node's structural metadata. */
  getNodeInfo(nodeId: string): Promise<NodeInfo>;

  /** Read multiple nodes in one round-trip. */
  getNodesInfo(nodeIds: string[]): Promise<NodeInfo[]>;

  /**
   * Scan an entire subtree in a single `figma_execute` call.
   *
   * Returns a flat array of all descendants (BFS order, root included)
   * and a `truncated` flag if the node count reached `maxNodes` (default 500).
   *
   * When `truncated` is true the caller SHOULD fall back to the old
   * `scanAllDescendants` helper which uses multiple `getNodeInfo` RTTs but
   * is guaranteed to be complete.
   */
  scanSubtree(rootId: string, maxNodes?: number): Promise<ScanSubtreeResult>;

  /**
   * Clone `count` copies of `sourceId` and append each to `parentId` in a
   * single `figma_execute` call.
   *
   * Returns the cloned nodes in append order (same as calling `cloneNode`
   * N times serially). Returns `[]` immediately when `count <= 0` without
   * issuing a `figma_execute` call.
   *
   * Safety: throws if `parentId` resolves to a GROUP node (consistent with
   * the GROUP-parent guard in `cloneNodeSafe`).
   */
  batchCloneNodes(p: {
    sourceId: string;
    parentId: string;
    count: number;
  }): Promise<NodeInfo[]>;

  /**
   * Clone a node. If `parentId` omitted, clone next to the source.
   * If `x`/`y` provided, the backend must respect parent coord semantics
   * (PAGE = absolute; non-auto-layout FRAME = FRAME-local; AUTO_LAYOUT =
   * value ignored). The renderer never passes `x`/`y` when parent might
   * be a GROUP (this client refuses to do so — see `cloneNodeSafe`).
   */
  cloneNode(p: {
    sourceId: string;
    parentId?: string;
    x?: number;
    y?: number;
    name?: string;
  }): Promise<NodeInfo>;

  /**
   * Instantiate a COMPONENT under `parentId` via `createInstance()`.
   *
   * `cloneNode` cannot be used for component variants: `clone()` inserts the
   * new node *inside the component set* first, which Figma turns into a
   * COMPONENT, and the follow-up move fails with "component inside a
   * component". `createInstance()` produces an INSTANCE directly.
   *
   * Optional: older backends (and test doubles) need not implement it; the
   * renderer only requires it when the markdown uses `- @职能：` bullets.
   */
  instantiateComponent?(p: {
    componentId: string;
    parentId: string;
    /** Renames the instance — role blocks rely on the variant name as identity. */
    name?: string;
  }): Promise<NodeInfo>;

  /**
   * Instantiate a *published* component by its library key, importing it into
   * the current file first. This is what makes cross-file rendering possible:
   * the target file no longer has to contain the template / 职能标记 set.
   */
  instantiateByKey?(p: {
    componentKey: string;
    parentId?: string;
    name?: string;
  }): Promise<NodeInfo>;

  /**
   * Turn an INSTANCE into a plain frame so its structure can be edited.
   * Figma refuses to append new children anywhere inside an instance.
   *
   * Returns the NEW frame node: `detachInstance()` replaces the instance and
   * the frame gets a different id, so callers must use the returned node.
   */
  detachInstance?(nodeId: string): Promise<NodeInfo>;

  /**
   * Place a live instance over a placeholder: instantiate the source (COMPONENT)
   * or clone it (INSTANCE), append under the placeholder's parent, scale it to
   * fit, remove the placeholder rectangle. Used for `figma_instance` assets so
   * the document keeps a real pasted sub-instance instead of a raster image.
   */
  placeInstance?(p: { sourceId: string; placeholderId: string }): Promise<NodeInfo>;

  /** Move a node. Coords are interpreted by parent type (see safety wrapper). */
  moveNode(nodeId: string, x: number, y: number): Promise<void>;

  /** Set TEXT.characters. Loads font automatically. */
  setTextContent(nodeId: string, characters: string): Promise<void>;

  /**
   * Batch text set, in one MCP call.
   *
   * `bold` (optional, per update): after writing, set the whole text to the
   * family's regular weight, then `[0, bold)` to its bold weight (0 = all
   * regular). Omitted = characters only, styles untouched.
   */
  setMultipleTextContents(updates: TextUpdate[]): Promise<TextWriteResult>;

  /** Batch delete. */
  deleteNodes(nodeIds: string[]): Promise<void>;

  /** Reparent. preserveAbsolutePosition recommended for visual hygiene. */
  reparentNode(p: {
    nodeId: string;
    newParentId: string;
    preserveAbsolutePosition?: boolean;
  }): Promise<void>;

  /** Place an image fill on a RECTANGLE/FRAME. Source can be data URI or URL. */
  setImageFill?(p: { nodeId: string; src: string }): Promise<void>;

  /**
   * Rasterize an in-file Figma node (COMPONENT / FRAME / GROUP) to a PNG
   * image and apply it as IMAGE fill on the target node.
   *
   * Why this exists (Bug 6, 2026-05-13): when the user provides a
   * reference design as a COMPONENT/FRAME on the canvas, it has no single
   * `imageHash` we could copy to 主图占位. The fix is to export the source
   * subtree as PNG bytes, create a Figma image from those bytes, and set
   * IMAGE fill on the placeholder.
   *
   * Backend implementation sketch:
   *   const bytes = await src.exportAsync({
   *     format: 'PNG',
   *     constraint: { type: 'SCALE', value: 1 }  // Bug 7: default SCALE=1 to avoid 5s timeout
   *   });
   *   const image = figma.createImage(bytes);
   *   placeholder.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
   */
  rasterizeNodeToImageFill?(p: {
    /** The source node to rasterize (its subtree is exported as PNG). */
    sourceNodeId: string;
    /** The target node whose `fills[]` will be replaced with the image. */
    targetNodeId: string;
    /** Export scale. Default 1 (stays under Figma MCP 5s timeout). */
    scale?: number;
    /** Optional region of the source, relative to its top-left. */
    crop?: CropRect;
  }): Promise<void>;

  /**
   * Fill one 配图 GROUP with a PNG of `sourceNodeId` (optionally cropped),
   * size the placeholder to the image's aspect ratio, and drop the hint
   * text — all in a single plugin execution.
   *
   * Cropping goes through a temporary clipping FRAME + `exportAsync`, NOT
   * `imageTransform`: inside the plugin sandbox `imageTransform` reads back
   * correctly but is ignored at render time, so the whole source gets
   * squashed into the box.
   *
   * Size rule: `w = min(sourceW, maxWidth)`, `h = round(sourceH * w / sourceW)`.
   */
  fillFigurePlaceholder?(p: {
    sourceNodeId: string;
    /** The 配图 GROUP holding the placeholder; switched to FIXED sizing. */
    groupId: string;
    /** The RECTANGLE that receives the IMAGE fill and the new size. */
    rectId: string;
    /** The hint TEXT to delete once the image is in, if any. */
    hintId?: string;
    crop?: CropRect;
    scale?: number;
    maxWidth: number;
  }): Promise<{ width: number; height: number }>;

  /** Wrap a risky batch in an undo entry. */
  commitUndoCheckpoint(label: string): Promise<void>;

  /** Pop N entries from the GLOBAL undo stack — use sparingly. */
  triggerUndo(times: number): Promise<void>;

  /** Scan a subtree by node types (for finding 气泡 type, role TEXTs etc). */
  scanByTypes(rootId: string, types: FigmaNodeType[]): Promise<NodeInfo[]>;

  /**
   * Read a whole document subtree in one call, with each node's raw stamp
   * (shared plugin data `gisop/stamp`) and own IMAGE fill hash. INSTANCE
   * children are not descended into (their `childIds` come back empty).
   *
   * Optional: without it the renderer cannot stamp or reconcile.
   */
  readStampedTree?(rootId: string, maxNodes?: number): Promise<StampedTree>;

  /**
   * Write stamps in one call. `stamp: null` clears. With `captureHash`, the
   * first IMAGE fill hash found in the node's subtree (pre-order) is written
   * into the stamp's `imageHash`; when none is found the stamp's `asset` is
   * dropped, so a failed fill is never remembered as applied.
   */
  stampNodes?(entries: StampEntry[]): Promise<void>;

  /**
   * Apply reconcile ops in order, in one call. Fonts for every `setText`
   * target are loaded once up front. Stops at the first op that cannot be
   * applied and reports its index; ops before it stay applied.
   */
  applyOps?(ops: ReconcileOp[]): Promise<ApplyOpsResult>;
}

export interface StampedNodeRaw {
  id: string;
  name: string;
  type: FigmaNodeType;
  parentId?: string;
  childIds: string[];
  characters?: string;
  /** Raw `gisop/stamp` plugin data; empty / missing = unstamped. */
  stamp?: string;
  /** The node's own first IMAGE fill hash, if any. */
  imageHash?: string | null;
  width?: number;
}

export interface StampedTree {
  nodes: StampedNodeRaw[];
  truncated: boolean;
  /** Page holding the root, when the root lives on one. */
  pageId?: string;
  /** Leftover scratch roots (from an interrupted sync) on that page. */
  strayScratchIds: string[];
}

export interface StampEntry {
  nodeId: string;
  stamp: Record<string, unknown> | null;
  captureHash?: boolean;
}

export interface TextUpdate {
  nodeId: string;
  characters: string;
  /** Number of leading characters to set bold; see setMultipleTextContents. */
  bold?: number;
}

export interface TextWriteResult {
  /** Font families with no loadable bold weight; their bold ranges were skipped. */
  boldUnavailable: string[];
}

export type ReconcileOp =
  | { op: 'setText'; nodeId: string; text: string; bold?: number }
  | { op: 'delete'; nodeId: string }
  /**
   * Insert or move `nodeId` into `parentId`, right after `afterId` (null =
   * at the front) and after the run of unstamped nodes that follows it.
   */
  | { op: 'place'; nodeId: string; parentId: string; afterId: string | null }
  | { op: 'stamp'; nodeId: string; stamp: Record<string, unknown> | null };

export interface ApplyOpsResult {
  applied: number;
  /** Index of the op that failed; absent when all applied. */
  failedAt?: number;
  reason?: string;
  /** See TextWriteResult. */
  boldUnavailable?: string[];
}

// --- Errors --------------------------------------------------------------

export class FigmaSafetyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FigmaSafetyError';
  }
}

export const SAFETY_CODES = {
  GROUP_CHILD_MOVE_FORBIDDEN: 'V2_SAFETY_GROUP_CHILD_MOVE_FORBIDDEN',
  GROUP_PARENT_CLONE_WITH_COORDS_FORBIDDEN:
    'V2_SAFETY_GROUP_PARENT_CLONE_WITH_COORDS_FORBIDDEN',
  BUBBLE_PARENT_NOT_FRAME: 'V2_SAFETY_BUBBLE_PARENT_NOT_FRAME',
  PROBE_VERIFICATION_FAILED: 'V2_SAFETY_PROBE_VERIFICATION_FAILED'
} as const;

// --- Safety wrappers -----------------------------------------------------

/**
 * Safe move: refuses if the node's parent is a GROUP (would explode the
 * GROUP bbox). For FRAME parents, the caller MUST pass FRAME-local
 * coordinates; we don't auto-convert here because some callers know they
 * already have local coords. See `placeBubbleInFrame` for the conversion
 * helper.
 */
export async function moveNodeSafe(
  backend: FigmaBackend,
  node: NodeInfo,
  x: number,
  y: number
): Promise<void> {
  if (node.parentType === 'GROUP') {
    throw new FigmaSafetyError(
      SAFETY_CODES.GROUP_CHILD_MOVE_FORBIDDEN,
      `cannot move_node "${node.name}" (${node.id}): parent is a GROUP, ` +
        `which interprets x/y as group-local and explodes the bbox. ` +
        `Either reparent first, or convert the GROUP to a FRAME.`
    );
  }
  await backend.moveNode(node.id, x, y);
}

/**
 * Safe clone: refuses to pass x/y when target parent is a GROUP.
 * Returns the new node info.
 */
export async function cloneNodeSafe(
  backend: FigmaBackend,
  p: {
    sourceId: string;
    parentId?: string;
    x?: number;
    y?: number;
    name?: string;
  }
): Promise<NodeInfo> {
  if (p.parentId && (p.x !== undefined || p.y !== undefined)) {
    const parent = await backend.getNodeInfo(p.parentId);
    if (parent.type === 'GROUP') {
      throw new FigmaSafetyError(
        SAFETY_CODES.GROUP_PARENT_CLONE_WITH_COORDS_FORBIDDEN,
        `cannot clone into GROUP "${parent.name}" (${parent.id}) with x/y; ` +
          `coord semantics are GROUP-local and will explode the bbox.`
      );
    }
  }
  return backend.cloneNode(p);
}

/**
 * Place a 标号/N bubble inside the 气泡 FRAME at the given offset
 * relative to the 1920×1080 main image.
 *
 * The 气泡 FRAME and 主图占位 always share the same rect, so the offset
 * inside the main image equals the FRAME-local coord we should pass to
 * `move_node`. We still verify the parent is a FRAME (not GROUP) before
 * proceeding — older template snapshots had 气泡 as GROUP.
 *
 * Source rule: docs/figma-mcp-pitfalls.md → 陷阱 2 + 模板特有规则
 */
export async function placeBubbleInFrame(
  backend: FigmaBackend,
  bubbleNode: NodeInfo,
  bubbleFrameNode: NodeInfo,
  offset: { x: number; y: number }
): Promise<void> {
  if (bubbleFrameNode.type !== 'FRAME') {
    throw new FigmaSafetyError(
      SAFETY_CODES.BUBBLE_PARENT_NOT_FRAME,
      `bubble parent "${bubbleFrameNode.name}" (${bubbleFrameNode.id}) is ` +
        `${bubbleFrameNode.type}, expected FRAME. Older template? Ask the ` +
        `user to select 气泡 and press Ctrl+Alt+G to wrap it in a FRAME.`
    );
  }
  // Clamp to main-image canvas to avoid silently off-canvas placement.
  const clampedX = clamp(offset.x, 0, MAIN_IMAGE_SIZE.width);
  const clampedY = clamp(offset.y, 0, MAIN_IMAGE_SIZE.height);
  await moveNodeSafe(backend, bubbleNode, clampedX, clampedY);
}

/**
 * Single-point probe: do one move, verify absoluteBoundingBox matches
 * expected. Use BEFORE batching N moves. Throws on mismatch so the caller
 * can stop the batch and trigger one undo (not N undos).
 *
 * `expectedAbsoluteXY` is what the bubble's top-left should land at after
 * the move, in PAGE coords. `tolerancePx` defaults to 2 to allow for
 * sub-pixel rounding inside Figma.
 */
export async function probeMoveOrThrow(
  backend: FigmaBackend,
  bubbleNode: NodeInfo,
  bubbleFrameNode: NodeInfo,
  offset: { x: number; y: number },
  tolerancePx = 2
): Promise<void> {
  await placeBubbleInFrame(backend, bubbleNode, bubbleFrameNode, offset);
  const after = await backend.getNodeInfo(bubbleNode.id);
  const frameBox = bubbleFrameNode.absoluteBoundingBox;
  if (!after.absoluteBoundingBox || !frameBox) {
    throw new FigmaSafetyError(
      SAFETY_CODES.PROBE_VERIFICATION_FAILED,
      `probe verify: missing absoluteBoundingBox after move`
    );
  }
  const expectedX = frameBox.x + offset.x;
  const expectedY = frameBox.y + offset.y;
  const dx = Math.abs(after.absoluteBoundingBox.x - expectedX);
  const dy = Math.abs(after.absoluteBoundingBox.y - expectedY);
  if (dx > tolerancePx || dy > tolerancePx) {
    throw new FigmaSafetyError(
      SAFETY_CODES.PROBE_VERIFICATION_FAILED,
      `probe verify: bubble landed at (${after.absoluteBoundingBox.x}, ` +
        `${after.absoluteBoundingBox.y}), expected (${expectedX}, ${expectedY}). ` +
        `MCP coord-system bug suspected; aborting batch.`
    );
  }
}

// --- Role TEXT helpers ---------------------------------------------------

/**
 * Given the 角色标签 FRAME node and the 7 children TEXT nodes, return the
 * IDs to KEEP and DELETE based on the cluster's roles[].
 *
 * Matching is by exact characters: "@程序", "@GUI", etc. We do NOT trust
 * positional order alone — if the template was edited and order changed,
 * we still match correctly.
 */
export function decideRoleKeepDelete(
  roleTextChildren: NodeInfo[],
  keepRoles: string[]
): { keep: string[]; delete: string[] } {
  const keepSet = new Set(keepRoles.map((r) => `@${r}`));
  const keep: string[] = [];
  const del: string[] = [];
  for (const child of roleTextChildren) {
    const ch = (child.characters ?? '').trim();
    if (keepSet.has(ch)) keep.push(child.id);
    else del.push(child.id);
  }
  return { keep, delete: del };
}

// --- Local helpers -------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// Re-export ROLE_TEXT_ORDER so callers can predict default child order.
export { ROLE_TEXT_ORDER };
