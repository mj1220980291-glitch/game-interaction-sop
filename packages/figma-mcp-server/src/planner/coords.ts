/**
 * Coordinate transforms for the layout planner.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/layout-planner/spec.md
 *
 * Figma's coordinate system rule we encode:
 *   - When the parent is a FRAME, child node.x/y is interpreted in the parent's
 *     LOCAL coordinate space.
 *   - When the parent is a PAGE, child node.x/y is interpreted in absolute
 *     canvas coordinates.
 *
 * Therefore, given an absolute target XY and the parent's absoluteBoundingBox,
 * we compute: local = abs - parent.absoluteBoundingBox{x,y} (FRAME only).
 */

export type ParentKind = 'FRAME' | 'PAGE';

export interface AbsoluteBox {
  x: number;
  y: number;
}

export interface XY {
  x: number;
  y: number;
}

/**
 * Convert an absolute (canvas) target XY into the coordinate value that should
 * be assigned to `node.x / node.y` when its parent is `parentKind` with the
 * given absoluteBoundingBox.
 */
export function toParentLocal(
  absTarget: XY,
  parentKind: ParentKind,
  parentBox: AbsoluteBox
): XY {
  if (parentKind === 'FRAME') {
    return {
      x: absTarget.x - parentBox.x,
      y: absTarget.y - parentBox.y
    };
  }
  // PAGE — pass through.
  return { x: absTarget.x, y: absTarget.y };
}
