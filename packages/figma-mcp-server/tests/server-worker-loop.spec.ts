/**
 * worker 生命周期：串行换人、失败保留旧的、shutdown 后不再起。
 *
 * Spec: openspec changes「免手动重启」
 */

import { describe, it, expect } from 'vitest';
import { createWorkerLoop, type WorkerHandle } from '../src/server/workerLoop.js';

function fakeWorker(log: string[], name: string): WorkerHandle {
  return {
    async stop(): Promise<void> {
      log.push(`stop:${name}`);
    }
  };
}

describe('createWorkerLoop', () => {
  it('第一次 restart 只起一个，不 stop 任何东西', async () => {
    const log: string[] = [];
    let spawns = 0;
    const loop = createWorkerLoop({
      spawn: async () => {
        spawns += 1;
        return fakeWorker(log, `w${spawns}`);
      }
    });

    await loop.restart('boot');
    expect(spawns).toBe(1);
    expect(log).toEqual([]);
    expect(loop.current()).toBeDefined();
  });

  it('换 worker 时先起新的再停旧的（不中断服务）', async () => {
    const log: string[] = [];
    let spawns = 0;
    const loop = createWorkerLoop({
      spawn: async () => {
        spawns += 1;
        log.push(`spawn:w${spawns}`);
        return fakeWorker(log, `w${spawns}`);
      }
    });

    await loop.restart('boot');
    await loop.restart('dist changed');
    expect(log).toEqual(['spawn:w1', 'spawn:w2', 'stop:w1']);
  });

  it('连续触发只按顺序排队，不会同时起两个', async () => {
    const log: string[] = [];
    let spawns = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const loop = createWorkerLoop({
      spawn: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        spawns += 1;
        return fakeWorker(log, `w${spawns}`);
      }
    });

    await Promise.all([
      loop.restart('a'),
      loop.restart('b'),
      loop.restart('c')
    ]);
    expect(maxInFlight).toBe(1);
    expect(spawns).toBe(3);
    // 最后只剩一个 worker
    expect(log.filter((l) => l.startsWith('stop:'))).toHaveLength(2);
  });

  it('spawn 失败时保留旧 worker 并抛错', async () => {
    const log: string[] = [];
    let attempt = 0;
    const loop = createWorkerLoop({
      spawn: async () => {
        attempt += 1;
        if (attempt === 2) throw new Error('spawn boom');
        return fakeWorker(log, `w${attempt}`);
      }
    });

    await loop.restart('boot');
    await expect(loop.restart('boom')).rejects.toThrow('spawn boom');
    expect(loop.current()).toBeDefined();
    expect(log).toEqual([]);
  });

  it('shutdown 之后不再起新的', async () => {
    const log: string[] = [];
    let spawns = 0;
    const loop = createWorkerLoop({
      spawn: async () => {
        spawns += 1;
        return fakeWorker(log, `w${spawns}`);
      }
    });

    await loop.restart('boot');
    await loop.shutdown();
    await loop.restart('after shutdown');
    expect(spawns).toBe(1);
    expect(loop.current()).toBeUndefined();
  });

  it('onSwap 拿到新 worker 与原因', async () => {
    const seen: string[] = [];
    const loop = createWorkerLoop({
      spawn: async () => fakeWorker([], 'w'),
      onSwap: (_handle, reason) => {
        seen.push(reason);
      }
    });

    await loop.restart('boot');
    await loop.restart('dist changed');
    expect(seen).toEqual(['boot', 'dist changed']);
  });
});
