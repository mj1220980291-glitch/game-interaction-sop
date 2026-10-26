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
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { FigmaBackend, NodeInfo, FigmaNodeType } from '../v2/figma-client.js';
import { SCRATCH_ROOT_NAME, STAMP_KEY, STAMP_NAMESPACE } from '../v2/reconcile/stamp.js';

// ---- image sources -------------------------------------------------------

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

/**
 * The plugin sandbox cannot fetch `file://` URLs (nor your localhost), so a
 * local image path must be inlined as a data URI before it reaches
 * `figma_execute`. Remote URLs and data URIs pass through untouched.
 */
function toFetchableImageSrc(src: string): string {
  if (/^(https?|data|blob):/i.test(src)) return src;
  const path = src.replace(/^file:\/\//i, '');
  if (!existsSync(path)) return src;
  const mime = IMAGE_MIME[extname(path).toLowerCase()] ?? 'image/png';
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

// ---- low-level execute helper -------------------------------------------

async function exec(
  client: Client,
  code: string,
  timeout = 15000,
  fileKey?: string
): Promise<unknown> {
  const res = await client.callTool({
    name: 'figma_execute',
    arguments: fileKey ? { code, timeout, fileKey } : { code, timeout }
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

// ---- text weight helpers (runs inside Figma plugin) ---------------------

/**
 * Regular / bold weight resolution for state-line bolding (runs inside the
 * plugin). `fonts` is the call's already-loaded, deduped font map; each
 * family is resolved once per call, so at most a few extra loadFontAsync.
 *
 * Regular = a non-bold style already on the batch's nodes, else `Regular`.
 * Bold    = first loadable of BOLD_STYLES. Missing → family reported back.
 *
 * Writing `characters` inherits the old first character's style, so callers
 * always pass `bold` (0 included) for bullet text; applyWeight then resets
 * the whole run to regular before bolding the prefix.
 */
const TEXT_WEIGHT_FNS = `
const BOLD_STYLES = ['Bold', 'SemiBold', 'Semibold', 'Medium'];
async function resolveWeights(families, fonts) {
  const loaded = new Set(fonts.keys());
  const tryLoad = async (f) => {
    const k = f.family + '\\u0000' + f.style;
    if (loaded.has(k)) return true;
    try { await figma.loadFontAsync(f); loaded.add(k); return true; } catch (e) { return false; }
  };
  const out = new Map();
  for (const family of families) {
    const own = [...fonts.values()].filter((f) => f.family === family);
    let regular = own.find((f) => !BOLD_STYLES.includes(f.style)) || null;
    if (!regular) {
      const r = { family, style: 'Regular' };
      if (await tryLoad(r)) regular = r;
    }
    let bold = null;
    for (const style of BOLD_STYLES) {
      const b = { family, style };
      if (await tryLoad(b)) { bold = b; break; }
    }
    out.set(family, { regular, bold });
  }
  return out;
}
function applyWeight(n, family, bold, weights, unavailable) {
  const w = weights.get(family);
  const len = n.characters.length;
  if (!w || len === 0) return;
  if (w.regular) n.setRangeFontName(0, len, w.regular);
  if (bold > 0) {
    if (w.bold) n.setRangeFontName(0, Math.min(bold, len), w.bold);
    else unavailable.add(family);
  }
}
`;

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

// ---- region export (runs inside Figma plugin) ---------------------------
//
// Crops through a temporary clipping FRAME + exportAsync. `imageTransform`
// is deliberately avoided: in the plugin sandbox it reads back correctly but
// is ignored at render time. The temp FRAME is removed in `finally` so a
// failed export never leaves debris on the page. Returned width/height are
// the region's logical size (independent of export scale).
const EXPORT_REGION_FN = `
async function exportRegion(src, crop, scale) {
  const constraint = { type: 'SCALE', value: scale };
  if (!crop) {
    const bytes = await src.exportAsync({ format: 'PNG', constraint });
    return { bytes, width: src.width, height: src.height };
  }
  const frame = figma.createFrame();
  try {
    frame.name = '__crop_tmp__';
    frame.fills = [];
    frame.clipsContent = true;
    frame.x = -100000;
    frame.y = -100000;
    frame.resize(crop.width, crop.height);
    const clone = src.clone();
    frame.appendChild(clone);
    clone.x = -crop.x;
    clone.y = -crop.y;
    const bytes = await frame.exportAsync({ format: 'PNG', constraint });
    return { bytes, width: crop.width, height: crop.height };
  } finally {
    frame.remove();
  }
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

/**
 * Build a backend bound to a specific Figma file.
 *
 * `fileKey` is optional. Omitted, every `figma_execute` lands in whatever file
 * is currently active in Figma Desktop — which is exactly how `target.fileKey`
 * used to be silently ignored. Passed, the Bridge routes each call to that
 * connected file instead, without switching the user's active file.
 * (Local Mode only; Cloud Mode rejects `fileKey` outright.)
 */
export function buildFigmaConsoleBackend(client: Client, fileKey?: string): FigmaBackend {
  // Single choke point: every op below goes through `run`, so binding the file
  // here is all it takes to target a file end to end.
  const run = (code: string, timeout?: number) => exec(client, code, timeout, fileKey);

  return {

    withFileKey(nextFileKey) {
      return buildFigmaConsoleBackend(client, nextFileKey);
    },

    // --- Read ops --------------------------------------------------------

    async getNodeInfo(nodeId) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        return serNode(n);
      `) as Record<string, unknown> | null;
      if (!r) throw new Error(`getNodeInfo: node ${nodeId} not found`);
      return mapNode(r);
    },

    async getNodesInfo(nodeIds) {
      const r = await run(`
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
      const r = await run(`
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

      const r = await run(`
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

    async placeInstance({ sourceId, placeholderId }) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const src = await figma.getNodeByIdAsync(${JSON.stringify(sourceId)});
        if (!src) throw new Error('placeInstance: source not found: ' + ${JSON.stringify(sourceId)});
        const ph = await figma.getNodeByIdAsync(${JSON.stringify(placeholderId)});
        if (!ph) throw new Error('placeInstance: placeholder not found');
        const parent = ph.parent;
        if (!parent) throw new Error('placeInstance: placeholder has no parent');
        const inst = src.type === 'COMPONENT' ? src.createInstance() : src.clone();
        parent.appendChild(inst);
        const px = ph.x, py = ph.y, pw = ph.width, phh = ph.height;
        const s = Math.min(pw / inst.width, phh / inst.height);
        if (isFinite(s) && s > 0 && s !== 1) inst.resize(Math.round(inst.width * s), Math.round(inst.height * s));
        inst.x = px + Math.round((pw - inst.width) / 2);
        inst.y = py + Math.round((phh - inst.height) / 2);
        ph.remove();
        return serNode(inst);
      `, 30000) as Record<string, unknown>;
      return mapNode(r);
    },

    async detachInstance(nodeId) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('detachInstance: node not found');
        if (n.type !== 'INSTANCE') return serNode(n);
        const frame = n.detachInstance();
        return serNode(frame);
      `, 15000) as Record<string, unknown>;
      return mapNode(r);
    },

    async instantiateByKey({ componentKey, parentId, name }) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const comp = await figma.importComponentByKeyAsync(${JSON.stringify(componentKey)});
        if (!comp) throw new Error('instantiateByKey: component not found for key ' + ${JSON.stringify(componentKey)});
        const inst = comp.createInstance();
        ${name != null ? `inst.name = ${JSON.stringify(name)};` : ''}
        ${parentId != null ? `
          const parent = await figma.getNodeByIdAsync(${JSON.stringify(parentId)});
          if (!parent) throw new Error('instantiateByKey: parent not found: ' + ${JSON.stringify(parentId)});
          parent.appendChild(inst);
        ` : ''}
        return serNode(inst);
      `, 30000) as Record<string, unknown>;
      return mapNode(r);
    },

    async instantiateComponent({ componentId, parentId, name }) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const src = await figma.getNodeByIdAsync(${JSON.stringify(componentId)});
        if (!src) throw new Error('instantiateComponent: component not found: ' + ${JSON.stringify(componentId)});
        if (src.type !== 'COMPONENT') throw new Error('instantiateComponent: not a COMPONENT: ' + src.type);
        const parent = await figma.getNodeByIdAsync(${JSON.stringify(parentId)});
        if (!parent) throw new Error('instantiateComponent: parent not found: ' + ${JSON.stringify(parentId)});
        const inst = src.createInstance();
        ${name != null ? `inst.name = ${JSON.stringify(name)};` : ''}
        parent.appendChild(inst);
        return serNode(inst);
      `, 20000) as Record<string, unknown>;
      return mapNode(r);
    },

    async cloneNode({ sourceId, parentId, x, y, name }) {
      const r = await run(`
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
      await run(`
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('moveNode: node not found: ' + ${JSON.stringify(nodeId)});
        n.x = ${x};
        n.y = ${y};
        return null;
      `);
    },

    async setTextContent(nodeId, characters) {
      await run(`
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
      // Load each distinct font once, then write. Figma throttles repeated
      // loadFontAsync calls (~1s each after the first handful, even for an
      // already-loaded font), so loading per node pushed a 47-text batch past
      // the plugin's 30s execute cap; deduped, the same batch takes ~13ms.
      const r = await run(`
        ${TEXT_WEIGHT_FNS}
        const updates = ${JSON.stringify(updates)};
        const targets = [];
        const fonts = new Map();
        const families = new Set();
        for (const { nodeId, characters, bold } of updates) {
          const n = await figma.getNodeByIdAsync(nodeId);
          if (!n || n.type !== 'TEXT') continue;
          const own = n.getRangeAllFontNames(0, n.characters.length || 1);
          const family = own[0] ? own[0].family : undefined;
          targets.push([n, characters, bold, family]);
          for (const f of own) fonts.set(f.family + '\\u0000' + f.style, f);
          if (bold !== undefined && family) families.add(family);
        }
        for (const f of fonts.values()) await figma.loadFontAsync(f);
        const weights = families.size > 0 ? await resolveWeights(families, fonts) : new Map();
        const unavailable = new Set();
        for (const [n, characters, bold, family] of targets) {
          n.characters = characters;
          if (bold !== undefined) applyWeight(n, family, bold, weights, unavailable);
        }
        return { boldUnavailable: [...unavailable] };
      `, 30000) as { boldUnavailable?: string[] } | null;
      return { boldUnavailable: r?.boldUnavailable ?? [] };
    },

    async deleteNodes(nodeIds) {
      await run(`
        const ids = ${JSON.stringify(nodeIds)};
        for (const id of ids) {
          const n = await figma.getNodeByIdAsync(id);
          if (n) n.remove();
        }
        return null;
      `, 15000);
    },

    async reparentNode({ nodeId, newParentId, preserveAbsolutePosition }) {
      await run(`
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
      // src is a URL, data URI, or a local path (inlined as a data URI here).
      const fetchable = toFetchableImageSrc(src);
      await run(`
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('setImageFill: node not found');
        const resp = await fetch(${JSON.stringify(fetchable)});
        const buf = await resp.arrayBuffer();
        const image = figma.createImage(new Uint8Array(buf));
        n.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
        return null;
      `, 30000);
    },

    async rasterizeNodeToImageFill({ sourceNodeId, targetNodeId, scale = 1, crop }) {
      await run(`
        ${EXPORT_REGION_FN}
        const src = await figma.getNodeByIdAsync(${JSON.stringify(sourceNodeId)});
        const tgt = await figma.getNodeByIdAsync(${JSON.stringify(targetNodeId)});
        if (!src) throw new Error('rasterizeNodeToImageFill: source node not found: ' + ${JSON.stringify(sourceNodeId)});
        if (!tgt) throw new Error('rasterizeNodeToImageFill: target node not found: ' + ${JSON.stringify(targetNodeId)});
        const { bytes } = await exportRegion(src, ${JSON.stringify(crop ?? null)}, ${scale});
        const image = figma.createImage(bytes);
        tgt.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
        return null;
      `, 30000);
    },

    async fillFigurePlaceholder({ sourceNodeId, groupId, rectId, hintId, crop, scale = 1, maxWidth }) {
      const r = await run(`
        ${EXPORT_REGION_FN}
        const src = await figma.getNodeByIdAsync(${JSON.stringify(sourceNodeId)});
        if (!src) throw new Error('fillFigurePlaceholder: source node not found: ' + ${JSON.stringify(sourceNodeId)});
        const group = await figma.getNodeByIdAsync(${JSON.stringify(groupId)});
        const rect = await figma.getNodeByIdAsync(${JSON.stringify(rectId)});
        if (!group || !rect) throw new Error('fillFigurePlaceholder: placeholder not found: group=' + ${JSON.stringify(groupId)} + ' rect=' + ${JSON.stringify(rectId)});

        const { bytes, width: srcW, height: srcH } = await exportRegion(src, ${JSON.stringify(crop ?? null)}, ${scale});
        const image = figma.createImage(bytes);
        rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];

        const w = Math.min(srcW, ${maxWidth});
        const h = Math.round(srcH * w / srcW);
        if ('layoutSizingHorizontal' in group) group.layoutSizingHorizontal = 'FIXED';
        rect.resize(w, h);

        ${hintId ? `
          const hint = await figma.getNodeByIdAsync(${JSON.stringify(hintId)});
          if (hint) hint.remove();
        ` : ''}
        return { width: w, height: h };
      `, 30000) as { width: number; height: number };
      return r;
    },

    async commitUndoCheckpoint(_label) {
      await run(`figma.commitUndo(); return null;`);
    },

    async triggerUndo(times) {
      for (let i = 0; i < times; i++) {
        await run(`figma.triggerUndo(); return null;`);
      }
    },

    async scanByTypes(rootId, types) {
      const r = await run(`
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
    },

    async readStampedTree(rootId, maxNodes = 20000) {
      const r = await run(`
        const root = await figma.getNodeByIdAsync(${JSON.stringify(rootId)});
        if (!root) return null;
        let page = root.parent;
        while (page && page.type !== 'PAGE') page = page.parent;
        const budget = ${maxNodes};
        const nodes = [];
        let truncated = false;
        const queue = [root];
        let head = 0;
        while (head < queue.length) {
          if (nodes.length >= budget) { truncated = true; break; }
          const n = queue[head++];
          let hash = null;
          if ('fills' in n && Array.isArray(n.fills)) {
            const f = n.fills.find((x) => x.type === 'IMAGE');
            if (f) hash = f.imageHash;
          }
          const descend = 'children' in n && n.type !== 'INSTANCE';
          nodes.push({
            id: n.id,
            name: n.name,
            type: n.type,
            parentId: n.parent ? n.parent.id : null,
            childIds: descend ? n.children.map((c) => c.id) : [],
            characters: n.type === 'TEXT' ? n.characters : null,
            stamp: n.getSharedPluginData(${JSON.stringify(STAMP_NAMESPACE)}, ${JSON.stringify(STAMP_KEY)}) || null,
            imageHash: hash,
            width: 'width' in n ? n.width : null
          });
          if (descend) for (const c of n.children) queue.push(c);
        }
        const strayScratchIds = page
          ? page.children.filter((c) => c.name === ${JSON.stringify(SCRATCH_ROOT_NAME)}).map((c) => c.id)
          : [];
        return { nodes, truncated, pageId: page ? page.id : null, strayScratchIds };
      `, 30000) as {
        nodes: Array<Record<string, unknown>>;
        truncated: boolean;
        pageId: string | null;
        strayScratchIds: string[];
      } | null;
      if (!r) throw new Error(`readStampedTree: node ${rootId} not found`);
      return {
        nodes: r.nodes.map((raw) => ({
          id: String(raw['id']),
          name: String(raw['name'] ?? ''),
          type: toNodeType(String(raw['type'] ?? '')),
          parentId: raw['parentId'] != null ? String(raw['parentId']) : undefined,
          childIds: Array.isArray(raw['childIds']) ? (raw['childIds'] as string[]) : [],
          characters: raw['characters'] != null ? String(raw['characters']) : undefined,
          stamp: raw['stamp'] != null ? String(raw['stamp']) : undefined,
          imageHash: (raw['imageHash'] as string | null | undefined) ?? null,
          width: typeof raw['width'] === 'number' ? (raw['width'] as number) : undefined
        })),
        truncated: r.truncated,
        pageId: r.pageId ?? undefined,
        strayScratchIds: r.strayScratchIds ?? []
      };
    },

    async stampNodes(entries) {
      if (entries.length === 0) return;
      await run(`
        ${FIRST_IMAGE_HASH_FN}
        const entries = ${JSON.stringify(entries)};
        for (const e of entries) {
          const n = await figma.getNodeByIdAsync(e.nodeId);
          if (!n) continue;
          if (e.stamp === null) {
            n.setSharedPluginData(${JSON.stringify(STAMP_NAMESPACE)}, ${JSON.stringify(STAMP_KEY)}, '');
            continue;
          }
          const data = Object.assign({}, e.stamp);
          if (e.captureHash) {
            const h = firstImageHash(n);
            data.imageHash = h;
            if (!h) delete data.asset;
          }
          n.setSharedPluginData(${JSON.stringify(STAMP_NAMESPACE)}, ${JSON.stringify(STAMP_KEY)}, JSON.stringify(data));
        }
        return null;
      `, 30000);
    },

    async applyOps(ops) {
      if (ops.length === 0) return { applied: 0 };
      const r = await run(`
        ${TEXT_WEIGHT_FNS}
        const NS = ${JSON.stringify(STAMP_NAMESPACE)};
        const KEY = ${JSON.stringify(STAMP_KEY)};
        const ops = ${JSON.stringify(ops)};
        const fonts = new Map();
        const families = new Set();
        const familyOf = new Map();
        for (const op of ops) {
          if (op.op !== 'setText') continue;
          const n = await figma.getNodeByIdAsync(op.nodeId);
          if (!n || n.type !== 'TEXT') continue;
          const own = n.getRangeAllFontNames(0, n.characters.length || 1);
          for (const f of own) fonts.set(f.family + '\\u0000' + f.style, f);
          if (own[0]) familyOf.set(op.nodeId, own[0].family);
          if (op.bold !== undefined && own[0]) families.add(own[0].family);
        }
        for (const f of fonts.values()) await figma.loadFontAsync(f);
        const weights = families.size > 0 ? await resolveWeights(families, fonts) : new Map();
        const unavailable = new Set();

        let applied = 0;
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          try {
            const n = await figma.getNodeByIdAsync(op.nodeId);
            if (op.op === 'delete') {
              if (n) n.remove();
            } else if (!n) {
              return { applied, failedAt: i, reason: op.op + ': node not found: ' + op.nodeId };
            } else if (op.op === 'setText') {
              if (n.type !== 'TEXT') return { applied, failedAt: i, reason: 'setText: not a TEXT: ' + op.nodeId };
              n.characters = op.text;
              if (op.bold !== undefined) applyWeight(n, familyOf.get(op.nodeId), op.bold, weights, unavailable);
            } else if (op.op === 'stamp') {
              n.setSharedPluginData(NS, KEY, op.stamp === null ? '' : JSON.stringify(op.stamp));
            } else if (op.op === 'place') {
              const p = await figma.getNodeByIdAsync(op.parentId);
              if (!p || !('children' in p)) return { applied, failedAt: i, reason: 'place: parent not found: ' + op.parentId };
              if (n.parent === p) p.appendChild(n);
              const kids = p.children.filter((c) => c !== n);
              let idx = 0;
              if (op.afterId) {
                const a = kids.findIndex((c) => c.id === op.afterId);
                if (a < 0) return { applied, failedAt: i, reason: 'place: anchor not found: ' + op.afterId };
                idx = a + 1;
              }
              while (idx < kids.length && !kids[idx].getSharedPluginData(NS, KEY)) idx++;
              p.insertChild(idx, n);
            }
            applied++;
          } catch (e) {
            return { applied, failedAt: i, reason: String(e && e.message ? e.message : e) };
          }
        }
        return { applied, boldUnavailable: [...unavailable] };
      `, 30000) as { applied: number; failedAt?: number; reason?: string; boldUnavailable?: string[] };
      return r;
    }
  };
}

const FIRST_IMAGE_HASH_FN = `
function firstImageHash(n) {
  if ('fills' in n && Array.isArray(n.fills)) {
    const f = n.fills.find((x) => x.type === 'IMAGE');
    if (f) return f.imageHash;
  }
  if ('children' in n) {
    for (const c of n.children) {
      const h = firstImageHash(c);
      if (h) return h;
    }
  }
  return null;
}
`;
