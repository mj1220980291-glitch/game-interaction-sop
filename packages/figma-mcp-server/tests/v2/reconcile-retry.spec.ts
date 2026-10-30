/**
 * 同步中途桥掉线的重试。
 *
 * 真机现象：同步跑到 `fill.chapterN` 抛 `Unable to establish connection to Figma
 * after 10 seconds`，同一份 md 立刻重跑就过。同步是收敛的，所以整轮重跑一次。
 */

import { describe, it, expect } from 'vitest';
import { reconcileWithRetry } from '../../src/v2/render.js';
import type { RenderResult } from '../../src/v2/render.js';
import type { DocIR } from '../../src/v2/ir.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';

const fail = (message: string): RenderResult => ({
  ok: false,
  errors: [{ code: 'V2_RECONCILE_RUNTIME_ERROR', message }],
  warnings: []
});

const ok: RenderResult = { ok: true, mode: 'reconcile', errors: [], warnings: [] };

const ir = {} as DocIR;
const input = { markdown: '# x', target: { rootId: '1:1' } } as never;
const backend = {} as FigmaBackend;

describe('reconcileWithRetry', () => {
  it('瞬时连接错误重跑一次并返回成功结果', async () => {
    let calls = 0;
    const result = await reconcileWithRetry(ir, [], input, backend, {
      sleep: async () => {},
      run: async () => {
        calls += 1;
        return calls === 1
          ? fail('figma_execute failed: Unable to establish connection to Figma after 10 seconds')
          : ok;
      }
    });

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('非瞬时错误（冲突 / 找不到节点）不重试', async () => {
    let calls = 0;
    const result = await reconcileWithRetry(ir, [], input, backend, {
      sleep: async () => {},
      run: async () => {
        calls += 1;
        return fail('applyOps stopped at op 3: node 12:34 not found');
      }
    });

    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it('第二次仍失败就把错误原样带回去', async () => {
    let calls = 0;
    const result = await reconcileWithRetry(ir, [], input, backend, {
      sleep: async () => {},
      run: async () => {
        calls += 1;
        return fail('Execution timed out after 30000ms');
      }
    });

    expect(result.ok).toBe(false);
    expect(calls).toBe(2);
    expect(result.errors[0]?.message).toContain('timed out');
  });
});
