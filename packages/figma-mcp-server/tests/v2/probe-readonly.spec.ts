/**
 * 探针只读保证。
 *
 * Spec: template-probe「探针只读」
 * Change: template-contract-and-probe (task 7.3)
 */

import { describe, it, expect } from 'vitest';
import type { FigmaBackend, NodeInfo } from '../../src/v2/figma-client.js';
import { probeTemplate } from '../../src/v2/probe/index.js';
import { official114, jinhun798, flatten } from './fixtures/probe-trees.js';

/** Backend that records every method call and implements only the read path. */
function recordingBackend(root: NodeInfo): { backend: FigmaBackend; calls: string[] } {
  const calls: string[] = [];
  const flat = flatten(root);
  const backend = new Proxy({} as FigmaBackend, {
    get(_target, prop: string) {
      if (prop === 'withFileKey') return undefined;
      if (prop === 'getNodeInfo') {
        return async (id: string) => {
          calls.push('getNodeInfo');
          const hit = flat.find((n) => n.id === id);
          if (!hit) throw new Error('not found');
          return hit;
        };
      }
      if (prop === 'scanSubtree') {
        return async () => {
          calls.push('scanSubtree');
          return { nodes: flat, truncated: false };
        };
      }
      return async () => {
        calls.push(prop);
        throw new Error(`probe must not call backend.${prop}`);
      };
    }
  });
  return { backend, calls };
}

describe('探针只读', () => {
  it('只调用 getNodeInfo + scanSubtree', async () => {
    const root = official114();
    const { backend, calls } = recordingBackend(root);
    const report = await probeTemplate({ nodeId: root.id, backend });
    expect(report.verdict).toBe('ready');
    expect(new Set(calls)).toEqual(new Set(['getNodeInfo', 'scanSubtree']));
  });

  it('完整跑完也不触发任何写方法', async () => {
    const root = jinhun798();
    const { backend, calls } = recordingBackend(root);
    const report = await probeTemplate({ nodeId: root.id, backend });
    expect(report.verdict).toBe('ready');
    const writes = calls.filter(
      (c) => c !== 'getNodeInfo' && c !== 'scanSubtree' && c !== 'withFileKey'
    );
    expect(writes).toEqual([]);
  });

  it('节点不存在时报 V2_PROBE_NODE_NOT_FOUND', async () => {
    const backend = new Proxy({} as FigmaBackend, {
      get(_t, prop: string) {
        if (prop === 'getNodeInfo') return async () => {
          throw new Error('not found');
        };
        if (prop === 'scanSubtree') return async () => ({ nodes: [], truncated: false });
        return async () => undefined;
      }
    });
    await expect(probeTemplate({ nodeId: 'nope', backend })).rejects.toMatchObject({
      code: 'V2_PROBE_NODE_NOT_FOUND'
    });
  });
});
