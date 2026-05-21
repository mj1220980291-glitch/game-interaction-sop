/**
 * Atomic figma_execute template: fill a TEXT node's characters by ID, after
 * loading the node's existing fonts so non-ASCII content does not silently fail.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 *
 * Caveat: when targeting a COMPONENT INSTANCE (node.type === 'INSTANCE'),
 * direct character editing fails silently — callers MUST use the dedicated
 * setInstanceProperty template for those cases.
 */

import { jsString } from './_serialize.js';

export interface FillTextParams {
  nodeId: string;
  text: string;
}

export function fillText(p: FillTextParams): string {
  const { nodeId, text } = p;
  return `
const node = await figma.getNodeByIdAsync(${jsString(nodeId)});
if (!node) throw new Error('Text node not found: ${nodeId}');
if (node.type !== 'TEXT') {
  throw new Error('fillText target is not TEXT (got ' + node.type + '): ${nodeId}');
}
// Load every font used by the existing characters before editing.
const fonts = node.getRangeAllFontNames(0, Math.max(1, node.characters.length || 1));
for (const f of fonts) {
  await figma.loadFontAsync(f);
}
node.characters = ${jsString(text)};
return { id: node.id, characters: node.characters };
`.trim();
}
