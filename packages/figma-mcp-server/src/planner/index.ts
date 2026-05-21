/**
 * Public surface of the layout-planner capability.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/layout-planner/spec.md
 */
export {
  plan,
  type PlanOutput,
  type SectionPlan,
  type BubblePlan,
  type PlanWarning,
  type PlanContext
} from './plan.js';
export { toParentLocal, type ParentKind, type AbsoluteBox, type XY } from './coords.js';
export { makeOverlayInsert, makeDesignInsert, type InsertInstruction } from './zorder.js';
export {
  alignScreenshots,
  type AlignedSlot,
  type AlignmentResult,
  type AlignmentWarning
} from './screenshots.js';
export { chooseTemplate, type TemplateChoice, type TemplateInputs } from './template.js';
export { cleanTitle } from './title.js';
