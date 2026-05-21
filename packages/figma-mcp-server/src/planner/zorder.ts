/**
 * Z-order instruction generator.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/layout-planner/spec.md
 *
 * IMPORTANT — Figma child-order semantics (verified via real plugin runtime
 * smoke test on 2026-05-12):
 *
 *   parent.children[0]            → BOTTOM (rendered first, painted under)
 *   parent.children[length - 1]   → TOP    (rendered last,  painted on top)
 *
 * So:
 *   - parent.insertChild(0, x)    → x goes to the BOTTOM
 *   - parent.appendChild(x)       → x goes to the TOP
 *
 * Our pipeline rule:
 *   - design canvas (clone of master)  → BOTTOM, via insertChild(0, design)
 *   - bubbles / overlays               → TOP,    via appendChild(bubble)
 *
 * Earlier versions of this file inverted the semantics, which caused the
 * "bubbles invisible under design" bug. The lint test in
 * tests/lint-templates.spec.ts was relaxed accordingly: appendChild is now
 * the REQUIRED op for overlay templates.
 */

export type InsertOp = 'insertChild' | 'appendChild';

export interface InsertInstruction {
  op: InsertOp;
  parentId: string;
  childId: string;
  /** Only meaningful when op === 'insertChild'. Always 0 for the design layer. */
  index?: number;
}

/**
 * Build an instruction that places `child` ON TOP of every existing child
 * of `parent` — i.e. the bubble/overlay layer. Uses appendChild so the node
 * lands at children[length-1] (top of the render stack in Figma).
 */
export function makeOverlayInsert(parentId: string, childId: string): InsertInstruction {
  return { op: 'appendChild', parentId, childId };
}

/**
 * Build an instruction that places `child` AT THE BOTTOM of `parent` — used
 * for the design canvas clone so subsequent overlays render above it.
 */
export function makeDesignInsert(parentId: string, childId: string): InsertInstruction {
  return { op: 'insertChild', parentId, childId, index: 0 };
}
