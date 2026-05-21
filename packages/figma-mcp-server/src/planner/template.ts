/**
 * Template choice decision.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/layout-planner/spec.md
 */

export type TemplateChoice = 'design-driven' | 'blank';

export interface TemplateInputs {
  designRefCount: number;
  screenshotCount: number;
}

export function chooseTemplate(inputs: TemplateInputs): TemplateChoice {
  if (inputs.designRefCount > 0) return 'design-driven';
  return 'blank';
}
