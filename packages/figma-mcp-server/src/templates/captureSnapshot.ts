/**
 * Atomic figma_execute template: capture a snapshot URL for a given node by
 * exporting it as PNG. Used at the end of a generation run for the report.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 *
 * The figma plugin sandbox returns a Uint8Array — we encode it as base64 so
 * it survives MCP transport.
 */

import { jsString } from './_serialize.js';

export interface CaptureSnapshotParams {
  nodeId: string;
  /** export scale; 1 = native, 2 = retina */
  scale?: number;
}

export function captureSnapshot(p: CaptureSnapshotParams): string {
  const { nodeId, scale = 1 } = p;
  return `
const node = await figma.getNodeByIdAsync(${jsString(nodeId)});
if (!node) throw new Error('Snapshot node not found: ${nodeId}');
const bytes = await node.exportAsync({
  format: 'PNG',
  constraint: { type: 'SCALE', value: ${Number(scale)} }
});
let binary = '';
for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
const base64 = (typeof btoa === 'function')
  ? btoa(binary)
  : Buffer.from(bytes).toString('base64');
return { id: node.id, format: 'PNG', base64, size: bytes.length };
`.trim();
}
