#!/usr/bin/env node
/**
 * adapter-dry-run — call each FigmaBackend method with representative
 * args, capture the JS string the adapter would ship to `exec`, print
 * them for manual replay inside figma-console MCP `figma_execute`.
 *
 * Usage:
 *   node scripts/adapter-dry-run.mjs
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const adapterMain = resolve(
  REPO_ROOT,
  'packages/mcp-adapter/dist/index.js'
);

const { createFigmaConsoleBackend } = await import(
  pathToFileURL(adapterMain).href
);

const captured = [];
const exec = async (code) => {
  captured.push(code);
  // stub returns for ops that expect a value
  if (code.includes('__toNodeInfo(n)')) {
    return { id: 'STUB:1', name: 'stub', type: 'FRAME' };
  }
  if (code.includes('__toNodeInfo(clone)')) {
    return { id: 'CLONE:1', name: 'stub-clone', type: 'FRAME' };
  }
  if (code.includes('const ids =')) {
    return [];
  }
  return null;
};

const backend = createFigmaConsoleBackend({ exec });

// Exercise representative ops
await backend.getNodeInfo('7:193');
await backend.getNodesInfo(['7:193', '7:223']);
await backend.setTextContent('15:1360', '玩家等级系统');
await backend.setMultipleTextContents([
  { nodeId: '15:1360', characters: 'a' },
  { nodeId: '15:1355', characters: '2026.05.13' }
]);
await backend.cloneNode({ sourceId: '1:44', parentId: '1:43' });
await backend.moveNode('15:1443', 856, 531);
await backend.deleteNodes(['15:1977', '15:1978']);
await backend.rasterizeNodeToImageFill({
  sourceNodeId: '15:1341',
  targetNodeId: '15:1440'
});

console.log('--- CAPTURED ' + captured.length + ' SCRIPTS ---\n');
const LABELS = [
  'getNodeInfo',
  'getNodesInfo',
  'setTextContent',
  'setMultipleTextContents',
  'cloneNode',
  'moveNode',
  'deleteNodes',
  'rasterizeNodeToImageFill'
];
for (let i = 0; i < captured.length; i++) {
  console.log('═══ [' + LABELS[i] + '] ═══');
  console.log(captured[i]);
  console.log('');
}
