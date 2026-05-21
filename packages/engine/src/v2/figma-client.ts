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
}

/**
 * Backend the host must wire. Each method maps roughly 1:1 to a
 * figma-console MCP tool but with sane typing. Implementations are
 * expected to be async and may throw. The engine wraps every call to
 * preserve the safety rules.
 */
export interface FigmaBackend {
  /** Read a single node's structural metadata. */
  getNodeInfo(nodeId: string): Promise<NodeInfo>;

  /** Read multiple nodes in one round-trip. */
  getNodesInfo(nodeIds: string[]): Promise<NodeInfo[]>;

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

  /** Move a node. Coords are interpreted by parent type (see safety wrapper). */
  moveNode(nodeId: string, x: number, y: number): Promise<void>;

  /** Set TEXT.characters. Loads font automatically. */
  setTextContent(nodeId: string, characters: string): Promise<void>;

  /** Batch text set, in one MCP call. */
  setMultipleTextContents(updates: Array<{ nodeId: string; characters: string }>): Promise<void>;

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
  }): Promise<void>;

  /** Wrap a risky batch in an undo entry. */
  commitUndoCheckpoint(label: string): Promise<void>;

  /** Pop N entries from the GLOBAL undo stack — use sparingly. */
  triggerUndo(times: number): Promise<void>;

  /** Scan a subtree by node types (for finding 气泡 type, role TEXTs etc). */
  scanByTypes(rootId: string, types: FigmaNodeType[]): Promise<NodeInfo[]>;
}

// --- ClusterBlockNodes ---------------------------------------------------

/**
 * Structural snapshot of a single "说明块" (cluster explanation block) in the
 * 1:14 template after it has been cloned and its children scanned.
 *
 * Used by `cloneClusterBlock` (render.ts) and `fillClusterGroup`.
 * `undefined` fields mean the template variant / snapshot did not have that
 * child — callers must guard before using.
 */
export interface ClusterBlockNodes {
  /** The block node itself (a clone of the seed cluster block). */
  blockId: string;
  /** `#Title` TEXT — the sub-label that becomes the subgroup heading. */
  subTitle?: NodeInfo;
  /** First `正文/规则` TEXT — used as clone source when more bullet nodes needed. */
  bulletSource?: NodeInfo;
  /** All `正文/规则` TEXT nodes found (may be 0 if template is stripped). */
  allBulletTexts: NodeInfo[];
  /** `Frame 4273...` FRAME — the role-tags container. */
  roleFrame?: NodeInfo;
  /** All `配图` GROUP nodes (optional image placeholder). */
  imagePlaceholders: NodeInfo[];
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
