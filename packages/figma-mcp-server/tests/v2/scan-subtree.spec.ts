/**
 * Unit tests for FigmaBackend.scanSubtree contract.
 *
 * Uses a pure in-memory mock backend — no Figma connection required.
 * Spec: openspec/changes/backend-scan-subtree-batch/specs/backend-scan-subtree/spec.md
 */

import { describe, it, expect } from 'vitest';
import type { FigmaBackend, NodeInfo, ScanSubtreeResult } from '../../src/v2/figma-client.js';

// ---- Minimal mock backend ------------------------------------------------

/**
 * Build a mock FigmaBackend whose scanSubtree is driven by a flat node map.
 * Only scanSubtree (and getNodeInfo for fallback tests) needs implementing.
 */
function makeMockBackend(
  nodeMap: Map<string, NodeInfo>,
  opts?: { maxNodesOverride?: number }
): FigmaBackend {
  const scanSubtree = async (rootId: string, maxNodes = 500): Promise<ScanSubtreeResult> => {
    const limit = opts?.maxNodesOverride ?? maxNodes;
    const root = nodeMap.get(rootId);
    if (!root) return { nodes: [], truncated: false };

    const result: NodeInfo[] = [];
    let truncated = false;
    const queue: NodeInfo[] = [root];
    while (queue.length > 0) {
      if (result.length >= limit) { truncated = true; break; }
      const node = queue.shift()!;
      result.push(node);
      if (node.childIds) {
        for (const cid of node.childIds) {
          const child = nodeMap.get(cid);
          if (child) queue.push(child);
        }
      }
    }
    return { nodes: result, truncated };
  };

  // Minimal stubs for the rest of the interface (not under test here).
  return {
    scanSubtree,
    getNodeInfo: async (id) => {
      const n = nodeMap.get(id);
      if (!n) throw new Error(`mock: node ${id} not found`);
      return n;
    },
    getNodesInfo: async (ids) => ids.map((id) => {
      const n = nodeMap.get(id);
      if (!n) throw new Error(`mock: node ${id} not found`);
      return n;
    }),
    cloneNode: async () => { throw new Error('not implemented'); },
    moveNode: async () => { throw new Error('not implemented'); },
    setTextContent: async () => { throw new Error('not implemented'); },
    setMultipleTextContents: async () => { throw new Error('not implemented'); },
    deleteNodes: async () => { throw new Error('not implemented'); },
    commitUndoCheckpoint: async () => { throw new Error('not implemented'); },
  } as unknown as FigmaBackend;
}

// ---- Test fixtures --------------------------------------------------------

/**
 * Build a small 5-node tree:
 *   root
 *   ├── child-a
 *   │   └── grandchild-a1
 *   └── child-b
 *       └── grandchild-b1
 */
function makeSmallTree(): Map<string, NodeInfo> {
  const map = new Map<string, NodeInfo>();
  const add = (n: NodeInfo) => map.set(n.id, n);

  add({ id: 'root', name: 'Root', type: 'FRAME', childIds: ['child-a', 'child-b'] });
  add({ id: 'child-a', name: 'ChildA', type: 'FRAME', parentId: 'root', childIds: ['gc-a1'] });
  add({ id: 'gc-a1', name: 'GrandchildA1', type: 'TEXT', parentId: 'child-a' });
  add({ id: 'child-b', name: 'ChildB', type: 'FRAME', parentId: 'root', childIds: ['gc-b1'] });
  add({ id: 'gc-b1', name: 'GrandchildB1', type: 'TEXT', parentId: 'child-b' });

  return map;
}

// ---- Tests ----------------------------------------------------------------

describe('FigmaBackend.scanSubtree — normal path', () => {
  it('returns all 5 nodes with truncated=false', async () => {
    const backend = makeMockBackend(makeSmallTree());
    const { nodes, truncated } = await backend.scanSubtree('root');

    expect(truncated).toBe(false);
    expect(nodes).toHaveLength(5);
    expect(nodes.map((n) => n.id)).toContain('root');
    expect(nodes.map((n) => n.id)).toContain('gc-a1');
    expect(nodes.map((n) => n.id)).toContain('gc-b1');
  });

  it('root is included in the result', async () => {
    const backend = makeMockBackend(makeSmallTree());
    const { nodes } = await backend.scanSubtree('root');
    expect(nodes[0]?.id).toBe('root');
  });

  it('BFS order: root → children → grandchildren', async () => {
    const backend = makeMockBackend(makeSmallTree());
    const { nodes } = await backend.scanSubtree('root');
    const ids = nodes.map((n) => n.id);

    // root must come before its children
    expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('child-a'));
    expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('child-b'));
    // children must come before grandchildren
    expect(ids.indexOf('child-a')).toBeLessThan(ids.indexOf('gc-a1'));
    expect(ids.indexOf('child-b')).toBeLessThan(ids.indexOf('gc-b1'));
  });
});

describe('FigmaBackend.scanSubtree — maxNodes budget', () => {
  it('returns truncated=true when tree exceeds maxNodes', async () => {
    const backend = makeMockBackend(makeSmallTree());
    // Limit to 3 nodes; tree has 5
    const { nodes, truncated } = await backend.scanSubtree('root', 3);

    expect(truncated).toBe(true);
    expect(nodes.length).toBe(3);
  });

  it('nodes length never exceeds maxNodes', async () => {
    const backend = makeMockBackend(makeSmallTree());
    const { nodes } = await backend.scanSubtree('root', 2);
    expect(nodes.length).toBeLessThanOrEqual(2);
  });
});

describe('FigmaBackend.scanSubtree — missing root', () => {
  it('returns empty nodes and truncated=false when rootId does not exist', async () => {
    const backend = makeMockBackend(makeSmallTree());
    const result = await backend.scanSubtree('nonexistent-id');

    expect(result.nodes).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});
