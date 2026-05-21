/**
 * Atomic figma_execute template: clone a source node and place it under a
 * parent FRAME / PAGE at given local coordinates. Returns the new node's ID.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 *
 * Hard rules baked in:
 *   - Use parent.insertChild(0, clone) — this places the clone at the
 *     BOTTOM of the children list, which in Figma renders BEHIND any
 *     siblings appended later (children[0] = bottom, children[-1] = top).
 *     This is exactly what we want for the design canvas: bubbles added
 *     afterwards via appendChild render on top of the design.
 *   - Re-read the clone's id from the just-created node, not from the source.
 *   - Return rich metadata for the executor's run report.
 */

import { jsString } from './_serialize.js';

export interface CloneAndPlaceParams {
  sourceId: string;
  parentId: string;
  x: number;
  y: number;
  /** Optional rename for the cloned node */
  name?: string;
}

export function cloneAndPlace(p: CloneAndPlaceParams): string {
  const { sourceId, parentId, x, y, name } = p;
  return `
const source = await figma.getNodeByIdAsync(${jsString(sourceId)});
if (!source) throw new Error('Source node not found: ${sourceId}');
const parent = await figma.getNodeByIdAsync(${jsString(parentId)});
if (!parent) throw new Error('Parent node not found: ${parentId}');
if (typeof parent.insertChild !== 'function') {
  throw new Error('Parent does not support insertChild: ${parentId}');
}
const clone = source.clone();
clone.x = ${Number(x)};
clone.y = ${Number(y)};
${name !== undefined ? `clone.name = ${jsString(name)};` : ''}
// Design canvas goes to the BOTTOM (children[0]) so overlays appended
// later render above it.
parent.insertChild(0, clone);
return { id: clone.id, name: clone.name, x: clone.x, y: clone.y };
`.trim();
}
