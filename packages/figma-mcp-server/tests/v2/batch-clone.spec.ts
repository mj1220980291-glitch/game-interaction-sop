/**
 * Unit tests for FigmaBackend.batchCloneNodes contract.
 *
 * Uses a pure in-memory mock — no Figma connection required.
 * Spec: openspec/changes/backend-batch-clone-nodes/specs/backend-batch-clone-nodes/spec.md
 */

import { describe, it, expect, vi } from 'vitest';
import type { FigmaBackend, NodeInfo } from '../../src/v2/figma-client.js';

// ---- Mock helpers --------------------------------------------------------

let _nextId = 1;
const nextId = () => `mock-${_nextId++}`;

/**
 * Build a mock FigmaBackend where batchCloneNodes creates N synthetic
 * NodeInfo objects (no real Figma; just ID/name tracking).
 *
 * `figma_execute_count` tracks how many times the underlying "exec" would
 * have been called — here we simulate it with a simple counter exposed
 * via the `batchCalls` spy array.
 */
interface MockBatchBackend extends FigmaBackend {
  batchCalls: Array<{ sourceId: string; parentId: string; count: number }>;
}

function makeMockBatchBackend(
  opts?: { sourceExists?: boolean; parentIsGroup?: boolean }
): MockBatchBackend {
  const calls: Array<{ sourceId: string; parentId: string; count: number }> = [];

  const batchCloneNodes = async (p: { sourceId: string; parentId: string; count: number }): Promise<NodeInfo[]> => {
    if (p.count <= 0) return [];

    if (opts?.sourceExists === false) {
      throw new Error(`batchCloneNodes: source not found: ${p.sourceId}`);
    }
    if (opts?.parentIsGroup === true) {
      throw new Error(`batchCloneNodes: refusing to clone into a GROUP parent (id=${p.parentId})`);
    }

    calls.push(p);
    // Simulate N clones
    return Array.from({ length: p.count }, (_, i) => ({
      id: nextId(),
      name: `clone-${i}`,
      type: 'TEXT' as const,
      parentId: p.parentId
    }));
  };

  return {
    batchCalls: calls,
    batchCloneNodes,
    // Minimal stubs — not under test
    scanSubtree: async () => ({ nodes: [], truncated: false }),
    getNodeInfo: async () => { throw new Error('not implemented'); },
    getNodesInfo: async () => { throw new Error('not implemented'); },
    cloneNode: async () => { throw new Error('not implemented'); },
    moveNode: async () => { throw new Error('not implemented'); },
    setTextContent: async () => { throw new Error('not implemented'); },
    setMultipleTextContents: async () => { throw new Error('not implemented'); },
    deleteNodes: async () => { throw new Error('not implemented'); },
    commitUndoCheckpoint: async () => { throw new Error('not implemented'); },
  } as unknown as MockBatchBackend;
}

// ---- Tests ----------------------------------------------------------------

describe('FigmaBackend.batchCloneNodes — normal path', () => {
  it('count=3 returns 3 NodeInfo objects', async () => {
    const backend = makeMockBatchBackend();
    const result = await backend.batchCloneNodes({
      sourceId: 'src-1',
      parentId: 'parent-1',
      count: 3
    });

    expect(result).toHaveLength(3);
    expect(result.every((n) => n.parentId === 'parent-1')).toBe(true);
  });

  it('result nodes appear in insertion order', async () => {
    const backend = makeMockBatchBackend();
    const result = await backend.batchCloneNodes({
      sourceId: 'src-1',
      parentId: 'parent-1',
      count: 4
    });

    // Names follow clone-0, clone-1, clone-2, clone-3 order
    expect(result.map((n) => n.name)).toEqual(['clone-0', 'clone-1', 'clone-2', 'clone-3']);
  });

  it('each clone has a unique id', async () => {
    const backend = makeMockBatchBackend();
    const result = await backend.batchCloneNodes({
      sourceId: 'src-1',
      parentId: 'parent-1',
      count: 5
    });

    const ids = result.map((n) => n.id);
    expect(new Set(ids).size).toBe(5);
  });
});

describe('FigmaBackend.batchCloneNodes — count=0 short-circuit', () => {
  it('count=0 returns empty array', async () => {
    const backend = makeMockBatchBackend();
    const result = await backend.batchCloneNodes({
      sourceId: 'src-1',
      parentId: 'parent-1',
      count: 0
    });

    expect(result).toEqual([]);
  });

  it('count=0 does NOT trigger a figma_execute call', async () => {
    const backend = makeMockBatchBackend();
    await backend.batchCloneNodes({ sourceId: 'src-1', parentId: 'parent-1', count: 0 });
    expect((backend as MockBatchBackend).batchCalls).toHaveLength(0);
  });

  it('count=-1 also returns empty array (negative guard)', async () => {
    const backend = makeMockBatchBackend();
    const result = await backend.batchCloneNodes({
      sourceId: 'src-1',
      parentId: 'parent-1',
      count: -1
    });
    expect(result).toEqual([]);
  });
});

describe('FigmaBackend.batchCloneNodes — error cases', () => {
  it('throws when sourceId does not exist', async () => {
    const backend = makeMockBatchBackend({ sourceExists: false });
    await expect(
      backend.batchCloneNodes({ sourceId: 'missing', parentId: 'parent-1', count: 1 })
    ).rejects.toThrow('source not found');
  });

  it('throws when parentId is a GROUP node', async () => {
    const backend = makeMockBatchBackend({ parentIsGroup: true });
    await expect(
      backend.batchCloneNodes({ sourceId: 'src-1', parentId: 'group-1', count: 1 })
    ).rejects.toThrow('GROUP parent');
  });
});
