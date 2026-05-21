/**
 * createFigmaConsoleBackend — a FigmaBackend implementation that speaks
 * to Figma via a user-supplied `exec(code)` function (typically wired to
 * the figma-console MCP plugin's `figma_execute` tool).
 *
 * The adapter is deliberately dumb: each method serializes its arguments
 * into a short JS string, forwards to `exec`, and re-hydrates the result.
 * All Figma-side coord-system safety rules are still enforced inside the
 * engine's own safety wrappers (`figma-client.ts`); this backend just
 * obeys those rules by faithfully passing through the numbers it is
 * given.
 *
 * Pitfall coverage — this backend does NOT decide parent types or coord
 * math. It reports them (via `getNodeInfo`) and performs atomic writes.
 * The engine's `moveNodeSafe`, `cloneNodeSafe`, `placeBubbleInFrame`
 * wrappers are where policy lives.
 *
 * Source of truth for pitfalls: @game-interaction-sop/engine docs/figma-mcp-pitfalls.md
 */

import type {
  FigmaBackend,
  FigmaNodeType,
  NodeInfo
} from '@game-interaction-sop/engine';
import { FIGMA_PLUGIN_HELPERS } from './plugin-helpers.js';
import { runScript, type FigmaExec } from './exec.js';

export interface CreateBackendOptions {
  /**
   * Caller-supplied bridge to figma-console MCP `figma_execute` (or any
   * compatible tool). Must return the raw value produced by the script's
   * top-level `return`, or throw.
   */
  exec: FigmaExec;
}

export function createFigmaConsoleBackend(
  opts: CreateBackendOptions
): FigmaBackend {
  const { exec } = opts;

  // Helper: emit a script that ends with `return <expr>;` and uses the
  // shared helpers.
  const script = (body: string) => FIGMA_PLUGIN_HELPERS + '\n' + body;

  return {
    // -------------------- Read --------------------

    async getNodeInfo(nodeId: string): Promise<NodeInfo> {
      const code = script(`
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) return null;
        return __toNodeInfo(n);
      `);
      const result = await runScript<NodeInfo | null>(
        exec,
        'getNodeInfo',
        code
      );
      if (!result) {
        throw new Error(`getNodeInfo: node ${nodeId} not found`);
      }
      return result;
    },

    async getNodesInfo(nodeIds: string[]): Promise<NodeInfo[]> {
      const code = script(`
        const ids = ${JSON.stringify(nodeIds)};
        const out = [];
        for (const id of ids) {
          const n = await figma.getNodeByIdAsync(id);
          if (n) out.push(__toNodeInfo(n));
        }
        return out;
      `);
      return runScript<NodeInfo[]>(exec, 'getNodesInfo', code);
    },

    async scanByTypes(
      rootId: string,
      types: FigmaNodeType[]
    ): Promise<NodeInfo[]> {
      const code = script(`
        const root = await figma.getNodeByIdAsync(${JSON.stringify(rootId)});
        if (!root) return [];
        const typeSet = new Set(${JSON.stringify(types)});
        const hits = __findAll(root, n => typeSet.has(n.type));
        return hits.map(__toNodeInfo);
      `);
      return runScript<NodeInfo[]>(exec, 'scanByTypes', code);
    },

    // -------------------- Write --------------------

    async cloneNode(p: {
      sourceId: string;
      parentId?: string;
      x?: number;
      y?: number;
      name?: string;
    }): Promise<NodeInfo> {
      const code = script(`
        const p = ${JSON.stringify(p)};
        const src = await figma.getNodeByIdAsync(p.sourceId);
        if (!src) throw new Error('cloneNode: source ' + p.sourceId + ' not found');
        const clone = src.clone();
        if (p.parentId) {
          const parent = await figma.getNodeByIdAsync(p.parentId);
          if (!parent) throw new Error('cloneNode: parent ' + p.parentId + ' not found');
          parent.appendChild(clone);
        }
        if (typeof p.x === 'number') clone.x = p.x;
        if (typeof p.y === 'number') clone.y = p.y;
        if (p.name) clone.name = p.name;
        return __toNodeInfo(clone);
      `);
      return runScript<NodeInfo>(exec, 'cloneNode', code);
    },

    async moveNode(nodeId: string, x: number, y: number): Promise<void> {
      const code = script(`
        const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!n) throw new Error('moveNode: ' + ${JSON.stringify(nodeId)} + ' not found');
        n.x = ${Number(x)};
        n.y = ${Number(y)};
        return { id: n.id, x: n.x, y: n.y };
      `);
      await runScript(exec, 'moveNode', code);
    },

    async setTextContent(nodeId: string, characters: string): Promise<void> {
      const code = script(`
        const t = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
        if (!t) throw new Error('setTextContent: ' + ${JSON.stringify(nodeId)} + ' not found');
        if (t.type !== 'TEXT') throw new Error('setTextContent: not a TEXT node');
        await __setText(t, ${JSON.stringify(characters)});
        return { id: t.id };
      `);
      await runScript(exec, 'setTextContent', code);
    },

    async setMultipleTextContents(
      updates: Array<{ nodeId: string; characters: string }>
    ): Promise<void> {
      if (updates.length === 0) return;
      const code = script(`
        const updates = ${JSON.stringify(updates)};
        for (const u of updates) {
          const t = await figma.getNodeByIdAsync(u.nodeId);
          if (!t || t.type !== 'TEXT') continue;
          await __setText(t, u.characters);
        }
        return { count: updates.length };
      `);
      await runScript(exec, 'setMultipleTextContents', code);
    },

    async deleteNodes(nodeIds: string[]): Promise<void> {
      if (nodeIds.length === 0) return;
      const code = script(`
        const ids = ${JSON.stringify(nodeIds)};
        let removed = 0;
        for (const id of ids) {
          const n = await figma.getNodeByIdAsync(id);
          if (n && !n.removed) { n.remove(); removed++; }
        }
        return { removed };
      `);
      await runScript(exec, 'deleteNodes', code);
    },

    async reparentNode(p: {
      nodeId: string;
      newParentId: string;
      preserveAbsolutePosition?: boolean;
    }): Promise<void> {
      const code = script(`
        const p = ${JSON.stringify(p)};
        const n = await figma.getNodeByIdAsync(p.nodeId);
        const np = await figma.getNodeByIdAsync(p.newParentId);
        if (!n) throw new Error('reparentNode: node ' + p.nodeId + ' not found');
        if (!np) throw new Error('reparentNode: new parent ' + p.newParentId + ' not found');
        let absX, absY;
        if (p.preserveAbsolutePosition && n.absoluteBoundingBox) {
          absX = n.absoluteBoundingBox.x;
          absY = n.absoluteBoundingBox.y;
        }
        np.appendChild(n);
        if (p.preserveAbsolutePosition && typeof absX === 'number' && np.absoluteBoundingBox) {
          n.x = absX - np.absoluteBoundingBox.x;
          n.y = absY - np.absoluteBoundingBox.y;
        }
        return { id: n.id };
      `);
      await runScript(exec, 'reparentNode', code);
    },

    async setImageFill(p: { nodeId: string; src: string }): Promise<void> {
      // src is expected to be a remote URL or a data URI decodable via fetch()
      const code = script(`
        const p = ${JSON.stringify(p)};
        const n = await figma.getNodeByIdAsync(p.nodeId);
        if (!n) throw new Error('setImageFill: ' + p.nodeId + ' not found');
        const res = await fetch(p.src);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const image = figma.createImage(bytes);
        n.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
        return { id: n.id, hash: image.hash, bytes: bytes.byteLength };
      `);
      await runScript(exec, 'setImageFill', code);
    },

    async rasterizeNodeToImageFill(p: {
      sourceNodeId: string;
      targetNodeId: string;
      scale?: number;
    }): Promise<void> {
      const scale = typeof p.scale === 'number' && p.scale > 0 ? p.scale : 1;
      const code = script(`
        const srcId = ${JSON.stringify(p.sourceNodeId)};
        const tgtId = ${JSON.stringify(p.targetNodeId)};
        const scale = ${scale};
        const src = await figma.getNodeByIdAsync(srcId);
        const tgt = await figma.getNodeByIdAsync(tgtId);
        if (!src) throw new Error('rasterize: source ' + srcId + ' not found');
        if (!tgt) throw new Error('rasterize: target ' + tgtId + ' not found');
        const bytes = await src.exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: scale }
        });
        const image = figma.createImage(bytes);
        tgt.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
        return { id: tgt.id, hash: image.hash, bytes: bytes.byteLength };
      `);
      await runScript(exec, 'rasterizeNodeToImageFill', code);
    },

    // -------------------- Undo --------------------

    async commitUndoCheckpoint(label: string): Promise<void> {
      const code = script(`
        if (typeof figma.commitUndo === 'function') {
          figma.commitUndo();
        }
        // label is for logging only; Figma has no public API to label checkpoints
        return { label: ${JSON.stringify(label)} };
      `);
      await runScript(exec, 'commitUndoCheckpoint', code);
    },

    async triggerUndo(times: number): Promise<void> {
      const code = script(`
        const n = ${Number(times)};
        if (typeof figma.triggerUndo === 'function') {
          for (let i = 0; i < n; i++) figma.triggerUndo();
        }
        return { times: n };
      `);
      await runScript(exec, 'triggerUndo', code);
    }
  };
}
