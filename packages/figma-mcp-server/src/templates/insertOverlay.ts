/**
 * Atomic figma_execute template: place an existing node ON TOP of a parent
 * (overlay layer), via parent.appendChild(child).
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 *
 * In Figma, children[length-1] renders on TOP — so appendChild is correct
 * for overlays. For the design canvas (which must sit BEHIND overlays),
 * use a different template (cloneAndPlace already handles that case via
 * its own insertChild(0, ...) call).
 */

import { jsString } from './_serialize.js';

export interface InsertOverlayParams {
  parentId: string;
  childId: string;
}

export function insertOverlay(p: InsertOverlayParams): string {
  const { parentId, childId } = p;
  return `
const parent = await figma.getNodeByIdAsync(${jsString(parentId)});
if (!parent) throw new Error('Parent not found: ${parentId}');
const child = await figma.getNodeByIdAsync(${jsString(childId)});
if (!child) throw new Error('Child not found: ${childId}');
if (typeof parent.appendChild !== 'function') {
  throw new Error('Parent does not support appendChild: ${parentId}');
}
// Hard rule: overlays go ON TOP via appendChild (children[length-1] = top in Figma).
parent.appendChild(child);
return { parentId: parent.id, childId: child.id, position: 'top' };
`.trim();
}
