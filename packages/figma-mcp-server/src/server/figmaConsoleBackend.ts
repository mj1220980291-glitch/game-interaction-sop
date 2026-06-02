/**
 * Builds a FigmaBackend by forwarding calls to figma-console-mcp
 * via an MCP client, using figma_execute for all complex operations.
 *
 * Important:
 * - figma-console wraps results as { success, result, error, ... }
 * - Figma plugin requires figma.getNodeByIdAsync (not getNodeById)
 * - figma_execute code must be async-aware
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { FigmaBackend, NodeInfo, FigmaNodeType } from '../v2/figma-client.js';

// ---- low-level execute helper -------------------------------------------

async function exec(
  client: Client,
  code: string,
  timeout = 15000
): Promise<unknown> {
  const res = await client.callTool({
    name: 'figma_execute',
    arguments: { code, timeout }
  });
  // figma-console MCP wraps content as: [{ type: 'text', text: JSON }]
  const content = (res as { content?: Array<{ type: string; text?: string }> }).content;
  if (!content || content.length === 0) return null;
  const first = content[0];
  if (!first?.text) return null;

  let parsed: unknown;
  try { parsed = JSON.parse(first.text); } catch { return first.text; }

  // Unwrap figma-console envelope: { success, result } or { success, error }
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    '_mcp' in (parsed as object)
  ) {
    const env = parsed as { success: boolean; result?: unknown; error?: string };
    if (!env.success) {
      throw new Error(`figma_execute failed: ${env.error ?? 'unknown error'}`);
    }
    return env.result ?? null;
  }
  return parsed;
}

// ---- node shape serialiser (runs inside Figma plugin, async-aware) ------

const SERIALIZE_NODE_FN = `
async function serNode(n) {
  if (!n) return null;
  return {
    id: n.id,
    name: n.name,
    type: n.type,
    absoluteBoundingBox: n.absoluteBoundingBox ?? null,
    parentId: n.parent ? n.parent.id : null,
    parentType: n.parent ? n.parent.type : null,
    childIds: ('children' in n) ? n.children.map(c => c.id) : null,
    characters: n.type === 'TEXT' ? n.characters : null
  };
}
`;

// ---- type coercions -----------------------------------------------------

function toNodeType(t: string): FigmaNodeType {
  const map: Record<string, FigmaNodeType> = {
    FRAME: 'FRAME', GROUP: 'GROUP', TEXT: 'TEXT',
    COMPONENT: 'COMPONENT', INSTANCE: 'INSTANCE',
    RECTANGLE: 'RECTANGLE', PAGE: 'PAGE'
  };
  return map[t] ?? 'OTHER';
}

function mapNode(raw: Record<string, unknown>): NodeInfo {
  return {
    id: String(raw['id'] ?? ''),
    name: String(raw['name'] ?? ''),
    type: toNodeType(String(raw['type'] ?? '')),
    absoluteBoundingBox: raw['absoluteBoundingBox'] as NodeInfo['absoluteBoundingBox'] ?? undefined,
    parentId: raw['parentId'] != null ? String(raw['parentId']) : undefined,
    parentType: raw['parentType'] != null ? toNodeType(String(raw['parentType'])) : undefined,
    childIds: Array.isArray(raw['childIds']) ? (raw['childIds'] as string[]) : undefined,
    characters: raw['characters'] != null ? String(raw['characters']) : undefined
  };
}

// ---- public factory -----------------------------------------------------

export function buildFigmaConsoleBackend(client: Client): FigmaBackend {
  return {

    // --- Read ops --------------------------------------------------------

    async getNodeInfo(nodeId) {
      const r = await exec(client, `
        ${SERIALIZE_NODE_FN}
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        return serNode(n);
      `) as Record<string, unknown> | null;
      if (!r) throw new Error(`getNodeInfo: node ${nodeId} not found`);
      return mapNode(r);
    },

    async getNodesInfo(nodeIds) {
      const r = await exec(client, `
        ${SERIALIZE_NODE_FN}
        const ids = ${JSON.stringify(nodeIds)};
        const results = [];
        for (const id of ids) {
          const n = await figma.getNodeByIdAsync(id);
          const s = await serNode(n);
          if (s) results.push(s);
        }
        return results;
      `, 20000) as Array<Record<string, unknown>>;
      return (r ?? []).map(mapNode);
    },

    async scanSubtree(rootId, maxNodes = 500) {
      const r = await exec(client, `
        ${SERIALIZE_NODE_FN}
        const root = await figma.getNodeByIdAsync(${JSON.stringify(rootId)});
        if (!root) return { nodes: [], truncated: false };
        const result = [];
        let truncated = false;
        const budget = ${maxNodes};
        // Iterative BFS — avoids deep recursion; children prop is sync
        const queue = [root];
        while (queue.length > 0) {
          if (result.length >= budget) { truncated = true; break; }
          const node = queue.shift();
          const s = await serNode(node);
          if (s) result.push(s);
          if ('children' in node) {
            for (const c of node.children) queue.push(c);
          }
        }
        return { nodes: result, truncated };
      `, 25000) as { nodes: Array<Record<string, unknown>>; truncated: boolean };
      return {
        nodes: (r?.nodes ?? []).map(mapNode),
        truncated: r?.truncated ?? false
      };
    },

    // --- Write ops -------------------------------------------------------

    async batchCloneNodes({ sourceId, parentId, count }) {
      // Short-circuit: no work needed, avoid round-trip.
      if (count <= 0) return [];

      const r = await exec(client, `
        ${SERIALIZE_NODE_FN}
        const src = await figma.getNodeByIdAsync(${JSON.stringify(sourceId)});
        if (!src) {
          const topLevel = figma.currentPage.children.map(c => ({ id: c.id, name: c.name, type: c.type }));
          throw new Error('batchCloneNodes: source not found: ' + ${JSON.stringify(sourceId)} + ' | top-level: ' + JSON.stringify(topLevel));
        }
        const parent = await figma.getNodeByIdAsync(${JSON.stringify(parentId)});
        if (!parent) throw new Error('batchCloneNodes: parent not found: ' + ${JSON.stringify(parentId)});
        if (parent.type === 'GROUP') {
          throw new Error('batchCloneNodes: refusing to clone into a GROUP parent (id=' + ${JSON.stringify(parentId)} + ')');
        }
        const results = [];
        for (let i = 0; i < ${count}; i++) {
          const clone = src.clone();
          parent.appendChild(clone);
          results.push(await serNode(clone));
        }
        return results;
      `, 20000) as Array<Record<string, unknown>>;
      return (r ?? []).map(mapNode);
    },

    async cloneNode({ sourceId, parentId, x, y, name }) {
      const r = await exec(client, `
        ${SERIALIZE_NODE_FN}
        const src = await figma.getNodeByIdAsync(${JSON.stringify(sourceId)});
        if (!src) {
          const topLevel = figma.currentPage.children.map(c => ({ id: c.id, name: c.name, type: c.type }));
          throw new Error('cloneNode: source not found: ' + ${JSON.stringify(sourceId)} + ' | top-level: ' + JSON.stringify(topLevel));
        }
        const clone = src.clone();
        ${name != null ? `clone.name = ${JSON.stringify(name)};` : ''}
        ${parentId != null ? `
          const parent = await figma.getNodeByIdAsync(${JSON.stringify(parentId)});
          if (!parent) throw new Error('cloneNode: parent not found: ' + ${JSON.stringify(parentId)});
          parent.appendChild(clone);
        ` : ''}
        ${x != null ? `clone.x = ${x};` : ''}
        ${y != null ? `clone.y = ${y};` : ''}
        return serNode(clone);
      `, 20000) as Record<string, unknown>;
      return mapNode(r);
    },

    async moveNode(nodeId, x, y) {
      await exec(client, `
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('moveNode: node not found: ' + ${JSON.stringify(nodeId)});
        n.x = ${x};
        n.y = ${y};
        return null;
      `);
    },

    async setTextContent(nodeId, characters) {
      await exec(client, `
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n || n.type !== 'TEXT') throw new Error('setTextContent: TEXT node not found: ' + ${JSON.stringify(nodeId)});
        const len = n.characters.length || 1;
        const fonts = n.getRangeAllFontNames(0, len);
        for (const f of fonts) await figma.loadFontAsync(f);
        n.characters = ${JSON.stringify(characters)};
        return null;
      `, 15000);
    },

    async setMultipleTextContents(updates) {
      await exec(client, `
        const updates = ${JSON.stringify(updates)};
        for (const { nodeId, characters } of updates) {
          const n = await figma.getNodeByIdAsync(nodeId);
          if (!n || n.type !== 'TEXT') continue;
          const len = n.characters.length || 1;
          const fonts = n.getRangeAllFontNames(0, len);
          for (const f of fonts) await figma.loadFontAsync(f);
          n.characters = characters;
        }
        return null;
      `, 30000);
    },

    async deleteNodes(nodeIds) {
      await exec(client, `
        const ids = ${JSON.stringify(nodeIds)};
        for (const id of ids) {
          const n = await figma.getNodeByIdAsync(id);
          if (n) n.remove();
        }
        return null;
      `, 15000);
    },

    async reparentNode({ nodeId, newParentId, preserveAbsolutePosition }) {
      await exec(client, `
        const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        const parent = await figma.getNodeByIdAsync(${JSON.stringify(newParentId)});
        if (!node || !parent) throw new Error('reparentNode: node or parent not found');
        ${preserveAbsolutePosition !== false ? `
          const bbox = node.absoluteBoundingBox;
          const absX = bbox ? bbox.x : node.x;
          const absY = bbox ? bbox.y : node.y;
          parent.appendChild(node);
          const pBbox = parent.absoluteBoundingBox;
          if (pBbox) { node.x = absX - pBbox.x; node.y = absY - pBbox.y; }
        ` : `parent.appendChild(node);`}
        return null;
      `, 15000);
    },

    async setImageFill({ nodeId, src }) {
      // src is a URL or base64 — create image from URL via fetch
      await exec(client, `
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('setImageFill: node not found');
        const resp = await fetch(${JSON.stringify(src)});
        const buf = await resp.arrayBuffer();
        const image = figma.createImage(new Uint8Array(buf));
        n.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
        return null;
      `, 30000);
    },

    async rasterizeNodeToImageFill({ sourceNodeId, targetNodeId, scale = 1 }) {
      await exec(client, `
        const src = await figma.getNodeByIdAsync(${JSON.stringify(sourceNodeId)});
        const tgt = await figma.getNodeByIdAsync(${JSON.stringify(targetNodeId)});
        if (!src || !tgt) throw new Error('rasterizeNodeToImageFill: node not found');
        const bytes = await src.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: ${scale} } });
        const image = figma.createImage(bytes);
        tgt.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
        return null;
      `, 30000);
    },

    async commitUndoCheckpoint(_label) {
      await exec(client, `figma.commitUndo(); return null;`);
    },

    async triggerUndo(times) {
      for (let i = 0; i < times; i++) {
        await exec(client, `figma.triggerUndo(); return null;`);
      }
    },

    async scanByTypes(rootId, types) {
      const r = await exec(client, `
        ${SERIALIZE_NODE_FN}
        const types = ${JSON.stringify(types)};
        const root = await figma.getNodeByIdAsync(${JSON.stringify(rootId)});
        if (!root) return [];
        const result = [];
        async function walk(n) {
          if (types.includes(n.type)) result.push(await serNode(n));
          if ('children' in n) for (const c of n.children) await walk(c);
        }
        await walk(root);
        return result;
      `, 25000) as Array<Record<string, unknown>>;
      return (r ?? []).map(mapNode);
    }
  };
}
