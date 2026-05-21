/**
 * Main planner entry. Pure function: same input → same output, no IO.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/layout-planner/spec.md
 */

import type { Doc } from '../dsl/index.js';
import { toParentLocal, type AbsoluteBox, type ParentKind, type XY } from './coords.js';
import { makeOverlayInsert, type InsertInstruction } from './zorder.js';
import { alignScreenshots, type AlignedSlot, type AlignmentWarning } from './screenshots.js';
import { chooseTemplate, type TemplateChoice } from './template.js';
import { cleanTitle } from './title.js';

export interface PlanWarning {
  code: string;
  message: string;
}

export interface BubblePlan {
  bubbleId: string;
  text: string;
  insert: InsertInstruction;
  /** local coordinates relative to the bubble's parent frame */
  position: XY;
}

export interface SectionPlan {
  index: number;
  title: string;
  bubbles: BubblePlan[];
  screenshot: AlignedSlot;
}

export interface PlanOutput {
  templateChoice: TemplateChoice;
  sections: SectionPlan[];
  warnings: PlanWarning[];
}

/**
 * Optional context the caller can supply when real Figma boxes are known.
 * In dry-run / unit-test mode we fall back to a deterministic placeholder
 * box so output stays reproducible.
 */
export interface PlanContext {
  /** Map of nodeId → its parent's absoluteBoundingBox + kind */
  parentBoxes?: Record<string, { kind: ParentKind; box: AbsoluteBox }>;
  /** Default parent box used when a bubble's parent is unknown */
  defaultParent?: { kind: ParentKind; box: AbsoluteBox };
  /** Synthesised section frame ID prefix (default: "section-") */
  sectionFramePrefix?: string;
}

const DEFAULT_PARENT: { kind: ParentKind; box: AbsoluteBox } = {
  kind: 'FRAME',
  box: { x: 0, y: 0 }
};

export function plan(doc: Doc, ctx: PlanContext = {}): PlanOutput {
  const warnings: PlanWarning[] = [];

  const templateChoice = chooseTemplate({
    designRefCount: doc.designRefs.length,
    screenshotCount: doc.screenshots.length
  });

  const alignment = alignScreenshots(
    doc.sections.map((s) => ({ index: s.index })),
    doc.screenshots.map((sh) => ({
      sectionIndex: sh.sectionIndex,
      src: sh.src,
      alt: sh.alt
    }))
  );
  for (const w of alignment.warnings) {
    warnings.push(toPlanWarning(w));
  }

  const framePrefix = ctx.sectionFramePrefix ?? 'section-';

  // When the doc carries a designRef, use the first one's nodeId as the
  // default parent for bubbles whose anchor is sectionRelXY/absXY (those
  // forms do not nominate a parent themselves). Otherwise fall back to a
  // synthesized `section-<index>` placeholder — callers must then
  // pre-create such frames in Figma. Using designRefs[0].nodeId is the
  // common case for "标注主图" docs.
  const defaultDesignParent = doc.designRefs[0]?.nodeId;

  const sections: SectionPlan[] = doc.sections.map((section, i) => {
    const sectionFrameId = defaultDesignParent ?? `${framePrefix}${section.index}`;
    const bubbles = section.bubbles.map((b) => buildBubblePlan(b, sectionFrameId, ctx));
    const slot = alignment.slots[i] ?? {
      sectionIndex: section.index,
      src: null,
      alt: ''
    };
    return {
      index: section.index,
      title: cleanTitle(section.title),
      bubbles,
      screenshot: slot
    };
  });

  return { templateChoice, sections, warnings };
}

function buildBubblePlan(
  bubble: Doc['sections'][number]['bubbles'][number],
  defaultParentId: string,
  ctx: PlanContext
): BubblePlan {
  const anchor = bubble.anchor as
    | { nodeId: string }
    | { absXY: [number, number] }
    | { sectionRelXY: [number, number] };

  let parentId = defaultParentId;
  let absTarget: XY;

  if ('nodeId' in anchor) {
    parentId = anchor.nodeId;
    // Without a real Figma read we cannot know the abs box of the anchored
    // node; place the bubble at the parent's origin (0,0 local) by default.
    absTarget = { x: 0, y: 0 };
    const ctxBox = ctx.parentBoxes?.[parentId];
    if (ctxBox) {
      absTarget = { x: ctxBox.box.x, y: ctxBox.box.y };
    }
  } else if ('absXY' in anchor) {
    absTarget = { x: anchor.absXY[0], y: anchor.absXY[1] };
  } else {
    // sectionRelXY → absolute is parent-origin + offset
    const parentBox = ctx.parentBoxes?.[parentId]?.box ?? DEFAULT_PARENT.box;
    absTarget = {
      x: parentBox.x + anchor.sectionRelXY[0],
      y: parentBox.y + anchor.sectionRelXY[1]
    };
  }

  const parentMeta =
    ctx.parentBoxes?.[parentId] ?? ctx.defaultParent ?? DEFAULT_PARENT;
  const position = toParentLocal(absTarget, parentMeta.kind, parentMeta.box);

  // Bubble nodes are synthesized at execution time; we use a deterministic
  // pseudo-id derived from bubble.id + parentId so plan output is stable.
  const bubbleNodeId = `bubble-${bubble.id}@${parentId}`;
  return {
    bubbleId: bubble.id,
    text: bubble.text,
    insert: makeOverlayInsert(parentId, bubbleNodeId),
    position
  };
}

function toPlanWarning(w: AlignmentWarning): PlanWarning {
  return { code: w.code, message: w.message };
}
