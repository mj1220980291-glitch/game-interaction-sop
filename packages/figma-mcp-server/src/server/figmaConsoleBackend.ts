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
function serNode(n) {
  if (!n) return null;
  const chars = n.type === 'TEXT' ? String(n.characters ?? '') : null;
  return {
    id: n.id,
    name: n.name,
    type: n.type,
    absoluteBoundingBox: n.absoluteBoundingBox ?? null,
    parentId: n.parent ? n.parent.id : null,
    parentType: n.parent ? n.parent.type : null,
    childIds: ('children' in n) ? n.children.map(c => c.id) : null,
    // Capped: capability detection only needs a line's opening (and inline
    // \`@角色\` tags, which never sit past the first few hundred chars). Keeping
    // whole paragraphs made 14k-node documents exceed the 25s scan budget.
    characters: chars === null ? null : chars.slice(0, 400),
    visible: typeof n.visible === 'boolean' ? n.visible : true,
    layoutMode: ('layoutMode' in n) ? n.layoutMode : null
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
    characters: raw['characters'] != null ? String(raw['characters']) : undefined,
    visible: typeof raw['visible'] === 'boolean' ? (raw['visible'] as boolean) : undefined,
    layoutMode:
      raw['layoutMode'] === 'HORIZONTAL' || raw['layoutMode'] === 'VERTICAL' || raw['layoutMode'] === 'NONE'
        ? (raw['layoutMode'] as NodeInfo['layoutMode'])
        : undefined
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

    async scanSubtree(rootId, maxNodes = 20000) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const root = await figma.getNodeByIdAsync(${JSON.stringify(rootId)});
        if (!root) return { nodes: [], truncated: false };
        const result = [];
        let truncated = false;
        const budget = ${maxNodes};
        // Iterative BFS — avoids deep recursion; children prop is sync
        const queue = [root];
        let head = 0;
        while (head < queue.length) {
          if (result.length >= budget) { truncated = true; break; }
          const node = queue[head++];
          const s = serNode(node);
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

    async createComponentFromNode({ nodeId, name }) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('createComponentFromNode: node not found: ' + ${JSON.stringify(nodeId)});
        if (n.type === 'COMPONENT') {
          ${name != null ? `n.name = ${JSON.stringify(name)};` : ''}
          return serNode(n);
        }
        // Figma 不接受 GROUP 直转（真机报 "Cannot create component from node"）。
        // 项目母版大多是 GROUP（796 的 Group 2363 / 798 的 Group 2360），
        // 所以先套一个同尺寸的透明 FRAME，再把这个 FRAME 转成组件。
        let target = n;
        if (n.type === 'GROUP') {
          const parent = n.parent;
          const gx = n.x, gy = n.y, gw = n.width, gh = n.height;
          const f = figma.createFrame();
          f.name = n.name;
          f.fills = [];
          f.clipsContent = false;
          f.resize(Math.max(gw, 1), Math.max(gh, 1));
          if (parent) parent.appendChild(f);
          f.x = gx;
          f.y = gy;
          f.appendChild(n);
          n.x = 0;
          n.y = 0;
          target = f;
        } else if (n.type !== 'FRAME' && n.type !== 'COMPONENT') {
          throw new Error('createComponentFromNode: unsupported type ' + n.type + ' for node ' + ${JSON.stringify(nodeId)});
        }
        const comp = figma.createComponentFromNode(target);
        ${name != null ? `comp.name = ${JSON.stringify(name)};` : ''}
        return serNode(comp);
      `, 60000) as Record<string, unknown>;
      return mapNode(r);
    },

    async combineAsVariants({ componentIds, parentId, name }) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const ids = ${JSON.stringify(componentIds)};
        if (ids.length < 2) throw new Error('combineAsVariants: need at least 2 components, got ' + ids.length);
        const comps = [];
        for (const id of ids) {
          const n = await figma.getNodeByIdAsync(id);
          if (!n) throw new Error('combineAsVariants: component not found: ' + id);
          if (n.type !== 'COMPONENT') throw new Error('combineAsVariants: not a COMPONENT: ' + id + ' (' + n.type + ')');
          comps.push(n);
        }
        const parent = await figma.getNodeByIdAsync(${JSON.stringify(parentId)});
        if (!parent) throw new Error('combineAsVariants: parent not found: ' + ${JSON.stringify(parentId)});
        const set = figma.combineAsVariants(comps, parent);
        ${name != null ? `set.name = ${JSON.stringify(name)};` : ''}
        return serNode(set);
      `, 20000) as Record<string, unknown>;
      return mapNode(r);
    },

    async setPluginData(entries) {
      if (entries.length === 0) return;
      await run(`
        const NS = ${JSON.stringify(STAMP_NAMESPACE)};
        const ops = ${JSON.stringify(entries)};
        for (const op of ops) {
          const n = await figma.getNodeByIdAsync(op.nodeId);
          if (!n) throw new Error('setPluginData: node not found: ' + op.nodeId);
          n.setSharedPluginData(NS, op.key, op.value === null ? '' : op.value);
        }
        return null;
      `, 20000);
    },

    async renameNode(nodeId, name) {
      await run(`
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('renameNode: node not found: ' + ${JSON.stringify(nodeId)});
        n.name = ${JSON.stringify(name)};
        return null;
      `, 15000);
    },

    async readComponentKey(nodeId) {
      const r = await run(`
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n || n.type !== 'COMPONENT') return null;
        return n.key || null;
      `, 15000) as string | null;
      return r ?? null;
    },

    async importComponentByKey(componentKey) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const comp = await figma.importComponentByKeyAsync(${JSON.stringify(componentKey)});
        if (!comp) throw new Error('importComponentByKey: not published: ' + ${JSON.stringify(componentKey)});
        return serNode(comp);
      `, 40000) as Record<string, unknown>;
      return mapNode(r);
    },

    async createInvisibleAnchor({ parentId, role }) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const parent = await figma.getNodeByIdAsync(${JSON.stringify(parentId)});
        if (!parent) throw new Error('createInvisibleAnchor: parent not found: ' + ${JSON.stringify(parentId)});
        const f = figma.createFrame();
        f.name = ${JSON.stringify('#anchor:')} + ${JSON.stringify(role)};
        f.resize(1, 1);
        f.fills = [];
        f.clipsContent = false;
        f.visible = false;
        parent.appendChild(f);
        return serNode(f);
      `, 15000) as Record<string, unknown>;
      return mapNode(r);
    },

    async setNodeVisible(nodeId, visible) {
      await run(`
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('setNodeVisible: node not found: ' + ${JSON.stringify(nodeId)});
        n.visible = ${visible ? 'true' : 'false'};
        return null;
      `, 15000);
    },

    async createFrame({ parentId, name, x = 0, y = 0, width, height }) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const f = figma.createFrame();
        f.name = ${JSON.stringify(name)};
        f.resize(${width}, ${height});
        f.fills = [];
        f.clipsContent = false;
        ${parentId ? `const parent = await figma.getNodeByIdAsync(${JSON.stringify(parentId)});
        if (!parent) throw new Error('createFrame: parent not found: ' + ${JSON.stringify(parentId)});
        parent.appendChild(f);` : ''}
        f.x = ${x};
        f.y = ${y};
        return serNode(f);
      `, 15000) as Record<string, unknown>;
      return mapNode(r);
    },

    async resizeNode(nodeId, width, height) {
      await run(`
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('resizeNode: node not found: ' + ${JSON.stringify(nodeId)});
        if (typeof n.resize === 'function') n.resize(${width}, ${height});
        return null;
      `, 15000);
    },

    async setAutoLayout({ nodeId, mode, itemSpacing, padding, hugHeight, absoluteChildIds }) {
      const p = padding ?? {};
      await run(`
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('setAutoLayout: node not found: ' + ${JSON.stringify(nodeId)});
        if (!('layoutMode' in n)) throw new Error('setAutoLayout: node has no layout: ' + n.type);

        n.paddingTop = ${p.top ?? 0};
        n.paddingRight = ${p.right ?? 0};
        n.paddingBottom = ${p.bottom ?? 0};
        n.paddingLeft = ${p.left ?? 0};
        n.itemSpacing = ${itemSpacing};
        n.primaryAxisAlignItems = 'MIN';
        n.counterAxisAlignItems = 'MIN';

        for (const id of ${JSON.stringify(absoluteChildIds ?? [])}) {
          const c = await figma.getNodeByIdAsync(id);
          if (c && 'layoutPositioning' in c) c.layoutPositioning = 'ABSOLUTE';
        }

        // 顺序很重要：先设绝对定位，再开自动布局；反过来 Figma 会先把
        // 舞台当作普通子级排一遍，位置已经错了。
        n.layoutMode = ${JSON.stringify(mode)};
        n.primaryAxisSizingMode = 'FIXED';
        n.counterAxisSizingMode = 'FIXED';
        ${hugHeight ? `n.layoutSizingVertical = 'HUG';` : `n.layoutSizingVertical = 'FIXED';`}
        n.layoutSizingHorizontal = 'FIXED';
        return null;
      `, 20000);
    },

    async clearFills(nodeIds) {
      await run(`
        for (const id of ${JSON.stringify(nodeIds)}) {
          const n = await figma.getNodeByIdAsync(id);
          if (n && 'fills' in n) n.fills = [];
        }
        return null;
      `, 20000);
    },

    async arrangePageChildren({ pageId, gapX = 120, gapY = 120, maxWidth = 6000 }) {
      const r = await run(`
        const page = await figma.getNodeByIdAsync(${JSON.stringify(pageId)});
        if (!page) throw new Error('arrangePageChildren: page not found: ' + ${JSON.stringify(pageId)});
        const GAP_X = ${gapX}, GAP_Y = ${gapY}, MAX_W = ${maxWidth};
        const kids = page.children.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
        let x = 0, y = 0, rowH = 0;
        const out = [];
        for (const n of kids) {
          if (x > 0 && x + n.width > MAX_W) { x = 0; y += rowH + GAP_Y; rowH = 0; }
          n.x = x;
          n.y = y;
          out.push({ name: n.name, x: Math.round(x), y: Math.round(y) });
          x += n.width + GAP_X;
          rowH = Math.max(rowH, n.height);
        }
        return out;
      `, 30000) as Array<{ name: string; x: number; y: number }>;
      return r ?? [];
    },

    async adoptInstances({ rootId, partsPageId, project, reuse, contentSize }) {
      const r = await run(`
        const ROOT = ${JSON.stringify(rootId)};
        const PARTS = ${JSON.stringify(partsPageId)};
        const PROJECT = ${JSON.stringify(project)};
        // 内容闸门：截图 / 界面局部图是项目原稿内容，渲染时会被替换，
        // 收进库只会污染资产。只有小尺寸的结构性零件才值得收编。
        const MAX_W = ${contentSize?.width ?? 600};
        const MAX_H = ${contentSize?.height ?? 400};
        // 原组件 id → 已收编的本库组件 id。跨部件回传，避免同一个 num
        // 三角被几十个实例各造一份组件。
        const reused = Object.assign({}, ${JSON.stringify(reuse ?? {})});
        const root = await figma.getNodeByIdAsync(ROOT);
        if (!root) throw new Error('adoptInstances: root not found: ' + ROOT);
        const partsPage = await figma.getNodeByIdAsync(PARTS);
        if (!partsPage) throw new Error('adoptInstances: parts page not found: ' + PARTS);

        const out = { adopted: [], sets: [], createdInstances: [], unresolved: [], skipped: [] };
        const ours = {};            // 已收编的组件 id，避免自我循环
        const bySet = {};           // 原组件集名 -> [{compId, variantName}]

        function collect(node, acc) {
          // dynamic-page 权限下 mainComponent 必须异步取（同步读会直接报错）。
          const walkAsync = async (n) => {
            if (n.type === 'INSTANCE') {
              const main = await n.getMainComponentAsync();
              // 自己造的实例不再二次收编，否则每轮都会把自己拆一遍。
              if (main && ours[main.id]) return;
              if (main && main.parent && main.parent.id === PARTS) return;
              acc.push({ inst: n, main: main });
              return;
            }
            if ('children' in n) for (const c of n.children) await walkAsync(c);
          };
          return walkAsync(node).then(() => acc);
        }

        let pass = 0;
        while (pass < 6) {
          pass++;
          const found = await collect(root, []);
          if (found.length === 0) break;
          for (const entry of found) {
            const inst = entry.inst;
            const main = entry.main;
            const parent = inst.parent;
            if (!parent) { out.unresolved.push({ nodeId: inst.id, reason: 'no parent' }); continue; }
            if (!main) { out.unresolved.push({ nodeId: inst.id, reason: 'no mainComponent' }); continue; }
            if (inst.width > MAX_W || inst.height > MAX_H) {
              out.skipped.push({ nodeId: inst.id, name: inst.name, width: Math.round(inst.width), height: Math.round(inst.height) });
              continue;
            }
            const index = parent.children.indexOf(inst);
            const x = inst.x, y = inst.y;
            const instName = inst.name;
            const originalName = main.name;
            const mp = main.parent;
            const originalSetName = (mp && mp.type === 'COMPONENT_SET') ? mp.name : null;
            let frame;
            try { frame = inst.detachInstance(); }
            catch (e) { out.unresolved.push({ nodeId: inst.id, reason: 'detach: ' + (e && e.message) }); continue; }
            const compName = originalSetName ? originalName : (PROJECT + ' / 零件 / ' + originalName);
            const originalId = main.id;
            let comp = null;
            let instance = null;
            try {
              // 同一个源组件只收编一次；后续实例直接复用已有组件。
              if (reused[originalId]) {
                const existing = await figma.getNodeByIdAsync(reused[originalId]);
                if (existing) {
                  instance = existing.createInstance();
                  instance.name = instName;
                  parent.insertChild(Math.max(index, 0), instance);
                  instance.x = x;
                  instance.y = y;
                  out.createdInstances.push(instance.id);
                  frame.remove();
                  continue;
                }
              }
              // 必须先挪出部件再转组件：图层还嵌在 COMPONENT 里时，
              // Figma 会直接拒绝（真机报 "Cannot create component from node"）。
              partsPage.appendChild(frame);
              comp = figma.createComponentFromNode(frame);
              comp.name = compName;
              comp.x = 0;
              comp.y = 0;
              reused[originalId] = comp.id;
              instance = comp.createInstance();
              instance.name = instName;
              parent.insertChild(Math.max(index, 0), instance);
              instance.x = x;
              instance.y = y;
            } catch (e) {
              // 单个零件失败不拖垮整篇：记进 unresolved，交给报告与人工处理。
              out.unresolved.push({ nodeId: inst.id, reason: 'adopt: ' + (e && e.message) });
              continue;
            }
            ours[comp.id] = true;
            out.createdInstances.push(instance.id);
            out.adopted.push({
              componentId: comp.id,
              name: compName,
              originalName: originalName,
              originalSetName: originalSetName
            });
            if (originalSetName) {
              (bySet[originalSetName] = bySet[originalSetName] || []).push({
                compId: comp.id,
                variantName: originalName
              });
            }
          }
        }

        // 变体集必须重建：detach 抹掉了变体关系，不重组就退化成互不相关的图层。
        for (const setName of Object.keys(bySet)) {
          const members = bySet[setName];
          if (members.length < 2) {
            // 只有一个成员时无法组集，但它已经是我们的独立组件、实例也换好了。
            // 改成独立组件的名字即可，不算"未收编"（否则报告会误报外部依赖）。
            const only = await figma.getNodeByIdAsync(members[0].compId);
            if (only) only.name = PROJECT + ' / 零件 / ' + setName;
            continue;
          }
          const comps = [];
          for (const m of members) {
            const c = await figma.getNodeByIdAsync(m.compId);
            if (c) comps.push(c);
          }
          try {
            const set = figma.combineAsVariants(comps, partsPage);
            set.name = PROJECT + ' / 零件 / ' + setName;
            set.x = 0;
            set.y = 0;
            out.sets.push({ setId: set.id, name: set.name, variants: comps.map((c) => c.name) });
          } catch (e) {
            out.unresolved.push({ nodeId: comps[0] ? comps[0].id : '', reason: 'combine: ' + (e && e.message) });
          }
        }
        return { adopted: out.adopted, sets: out.sets, createdInstances: out.createdInstances, unresolved: out.unresolved, skipped: out.skipped, mapping: reused };
      `, 120000) as {
        adopted: unknown[];
        sets: unknown[];
        createdInstances: string[];
        unresolved: unknown[];
        skipped: Array<{ nodeId: string; name: string; width: number; height: number }>;
        mapping: Record<string, string>;
      };
      return {
        adopted: (r?.adopted ?? []) as never,
        sets: (r?.sets ?? []) as never,
        createdInstances: r?.createdInstances ?? [],
        unresolved: (r?.unresolved ?? []) as never,
        skipped: r?.skipped ?? [],
        mapping: r?.mapping ?? {}
      };
    },

    async normalizeFontsInSubtree({ rootId, family, weightMap }) {
      const r = await run(`
        const root = await figma.getNodeByIdAsync(${JSON.stringify(rootId)});
        if (!root) throw new Error('normalizeFontsInSubtree: node not found: ' + ${JSON.stringify(rootId)});
        const FAMILY = ${JSON.stringify(family)};
        const MAP = ${JSON.stringify(weightMap)};
        const res = { changed: 0, unmapped: [] };
        const loaded = {};
        const keyOf = (s) => String(s || '').toLowerCase().replace(/[\\s_-]/g, '');
        async function apply(n, start, end, fontName) {
          const k = keyOf(fontName.style);
          const style = MAP[k] || 'Regular';
          if (fontName.family === FAMILY && fontName.style === style) return;
          const fk = FAMILY + '/' + style;
          if (!loaded[fk]) { await figma.loadFontAsync({ family: FAMILY, style: style }); loaded[fk] = true; }
          if (start == null) n.fontName = { family: FAMILY, style: style };
          else n.setRangeFontName(start, end, { family: FAMILY, style: style });
          res.changed++;
          // 「映射」的判据：原字重名与目标字重名不同（Light→Regular 要记，
          // Bold→Bold 不记）。与 font-normalize.ts 的 mapFontStyle 同义。
          if (k !== String(style).toLowerCase()) {
            const from = fontName.family + '/' + fontName.style;
            if (!res.unmapped.some((u) => u.nodeId === n.id && u.from === from)) {
              res.unmapped.push({ nodeId: n.id, from: from });
            }
          }
        }
        async function walk(n) {
          if (n.type === 'TEXT' && n.characters && n.characters.length > 0) {
            let segs = null;
            try { segs = n.getStyledTextSegments ? n.getStyledTextSegments(['fontName']) : null; } catch (e) { segs = null; }
            if (segs && segs.length > 0) {
              for (const s of segs) await apply(n, s.start, s.end, s.fontName);
            } else if (n.fontName) {
              await apply(n, null, null, n.fontName);
            }
          }
          if ('children' in n) { for (const c of n.children) await walk(c); }
        }
        await walk(root);
        return res;
      `, 60000) as { changed: number; unmapped: Array<{ nodeId: string; from: string }> };
      return { changed: r?.changed ?? 0, unmapped: r?.unmapped ?? [] };
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

    async cloneNode({ sourceId, parentId, x, y, name }) {      const r = await run(`
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
      `, 60000) as Record<string, unknown>;
      return mapNode(r);
    },

    async cloneSlimPart({ sourceId, parentId, name, part }) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const src = await figma.getNodeByIdAsync(${JSON.stringify(sourceId)});
        if (!src) throw new Error('cloneSlimPart: source not found: ' + ${JSON.stringify(sourceId)});
        const clone = src.clone();
        ${parentId ? `
          const parent = await figma.getNodeByIdAsync(${JSON.stringify(parentId)});
          if (!parent) throw new Error('cloneSlimPart: parent not found: ' + ${JSON.stringify(parentId)});
          parent.appendChild(clone);
        ` : ''}
        ${name ? `clone.name = ${JSON.stringify(name)};` : ''}

        // 克隆与清空放在同一次 exec：中间不留 RPC 间隙，插件不会被连接层判死。
        const part = ${JSON.stringify(part)};
        if (part === 'chapter') {
          let col = null;
          let best = -1;
          for (const c of clone.children) {
            const n = c.findAll((x) => x.type === 'TEXT').length;
            if (n > best) { best = n; col = c; }
          }
          if (col) for (const c of [...col.children]) c.remove();
        } else if (part === 'cluster') {
          const bullets = clone.findAll((x) => x.name === '正文/规则' && x.visible);
          for (const b of bullets.slice(1)) b.remove();
          const groups = clone.findAll((x) => x.name === '#Title' && x.visible);
          for (const g of groups.slice(1)) g.remove();
        }
        return serNode(clone);
      `, 90000) as Record<string, unknown>;
      return mapNode(r);
    },

    async buildChapterShell({ sourceId, parentId, name }) {
      const r = await run(`
        ${SERIALIZE_NODE_FN}
        const src = await figma.getNodeByIdAsync(${JSON.stringify(sourceId)});
        if (!src) throw new Error('buildChapterShell: source not found: ' + ${JSON.stringify(sourceId)});
        const parent = ${parentId ? `await figma.getNodeByIdAsync(${JSON.stringify(parentId)})` : 'figma.currentPage'};
        if (!parent) throw new Error('buildChapterShell: parent not found');

        const root = figma.createFrame();
        root.name = ${JSON.stringify(name ?? '章节')};
        root.fills = [];
        root.clipsContent = false;
        root.resize(Math.max(src.width, 1), Math.max(src.height, 1));
        parent.appendChild(root);
        root.x = src.x;
        root.y = src.y;

        // 说明栏 = 最高的那个子节点（横跨整章）；图区 = 另一个最宽的。
        // 不用「统计文本数」：那要遍历整棵 7000 节点子树，单次调用会超 10 秒。
        let graphic = null, column = null, gBest = -1, cBest = -1;
        for (const c of src.children) {
          const h = c.height ?? 0;
          if (h > cBest) { cBest = h; column = c; }
        }
        for (const c of src.children) {
          if (c === column) continue;
          const w = c.width ?? 0;
          if (w > gBest) { gBest = w; graphic = c; }
        }

        if (graphic) {
          // 图区不搬原稿：每份文档都要换成自己的图，搬过来只会拖慢编译。
          // 直接按图区尺寸放一个空矩形，渲染时往它上面贴图。
          const g = figma.createRectangle();
          g.name = '主图占位';
          g.resize(Math.max(graphic.width, 1), Math.max(graphic.height, 1));
          root.appendChild(g);
          g.x = graphic.x;
          g.y = graphic.y;
          g.fills = [];
        }

        if (column) {
          const col = figma.createFrame();
          col.name = 'Text';
          col.resize(Math.max(column.width, 1), Math.max(column.height, 1));
          root.appendChild(col);
          col.x = column.x;
          col.y = column.y;
          // 复制布局与外观属性（说明栏靠它们维持排版）
          for (const key of ['layoutMode','itemSpacing','paddingLeft','paddingRight','paddingTop','paddingBottom','primaryAxisSizingMode','counterAxisSizingMode','cornerRadius','clipsContent']) {
            if (column[key] !== undefined && key in col) { try { col[key] = column[key]; } catch (e) {} }
          }
          try { col.fills = column.fills; } catch (e) {}
          try { col.strokes = column.strokes; } catch (e) {}
        }

        return serNode(root);
      `, 30000) as Record<string, unknown>;
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
      `, 30000);
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
