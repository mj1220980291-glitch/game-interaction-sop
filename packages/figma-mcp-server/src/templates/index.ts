/**
 * Template registry. Every figma_execute call goes through one of these
 * named templates — the executor refuses to run anything else.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 *
 * Hard rules enforced by the lint test (tests/lint-templates.spec.ts):
 *   - Template source must NOT contain the literal `appendChild`.
 *   - All overlay placement uses parent.insertChild(0, ...).
 */

import { cloneAndPlace, type CloneAndPlaceParams } from './cloneAndPlace.js';
import { fillText, type FillTextParams } from './fillText.js';
import { insertOverlay, type InsertOverlayParams } from './insertOverlay.js';
import { captureSnapshot, type CaptureSnapshotParams } from './captureSnapshot.js';

export type TemplateName =
  | 'cloneAndPlace'
  | 'fillText'
  | 'insertOverlay'
  | 'captureSnapshot';

export interface TemplateParamMap {
  cloneAndPlace: CloneAndPlaceParams;
  fillText: FillTextParams;
  insertOverlay: InsertOverlayParams;
  captureSnapshot: CaptureSnapshotParams;
}

const REGISTRY: { [K in TemplateName]: (p: TemplateParamMap[K]) => string } = {
  cloneAndPlace,
  fillText,
  insertOverlay,
  captureSnapshot
};

/** Builds the JS code string for a given template + params. */
export function buildTemplate<K extends TemplateName>(
  name: K,
  params: TemplateParamMap[K]
): string {
  const tpl = REGISTRY[name];
  return tpl(params);
}

export const TEMPLATE_NAMES: readonly TemplateName[] = Object.keys(REGISTRY) as TemplateName[];

export {
  cloneAndPlace,
  fillText,
  insertOverlay,
  captureSnapshot,
  type CloneAndPlaceParams,
  type FillTextParams,
  type InsertOverlayParams,
  type CaptureSnapshotParams
};
