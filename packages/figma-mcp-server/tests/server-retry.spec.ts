/**
 * 发布后的假死重试：只有连接类错误才重试。
 *
 * Spec: openspec changes「渲染后固定截图 + 发布后自动重试」
 */

import { describe, it, expect } from 'vitest';
import { isTransientBridgeError, retryTransient } from '../src/server/retry.js';

describe('isTransientBridgeError', () => {
  it('超时 / 断连算临时故障', () => {
    expect(isTransientBridgeError(new Error('Execution timed out after 30000ms'))).toBe(true);
    expect(
      isTransientBridgeError(new Error('Unable to establish connection to Figma after 10 seconds'))
    ).toBe(true);
    expect(isTransientBridgeError(new Error('MCP error -32000: Connection closed'))).toBe(true);
    expect(isTransientBridgeError(new Error('read ECONNRESET'))).toBe(true);
  });

  it('「没发布」「找不到节点」重试也没用', () => {
    expect(isTransientBridgeError(new Error('not published: abc'))).toBe(false);
    expect(isTransientBridgeError(new Error('instantiateByKey: component not found'))).toBe(false);
    expect(isTransientBridgeError(undefined)).toBe(false);
  });
});

describe('retryTransient', () => {
  const noSleep = { sleep: async () => {} };

  it('第一次就成功时只调用一次', async () => {
    let calls = 0;
    const result = await retryTransient(async () => {
      calls += 1;
      return 'ok';
    }, noSleep);
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('临时故障后重试成功', async () => {
    let calls = 0;
    const result = await retryTransient(async () => {
      calls += 1;
      if (calls === 1) throw new Error('Execution timed out after 30000ms');
      return 'ok';
    }, noSleep);
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('非临时错误立即抛出，不浪费时间', async () => {
    let calls = 0;
    await expect(
      retryTransient(async () => {
        calls += 1;
        throw new Error('not published');
      }, noSleep)
    ).rejects.toThrow('not published');
    expect(calls).toBe(1);
  });

  it('用完次数还是失败就抛出，并记录每次重试', async () => {
    let calls = 0;
    const logs: string[] = [];
    await expect(
      retryTransient(
        async () => {
          calls += 1;
          throw new Error('Execution timed out');
        },
        { ...noSleep, attempts: 3, log: (m) => logs.push(m) }
      )
    ).rejects.toThrow('Execution timed out');
    expect(calls).toBe(3);
    expect(logs).toHaveLength(2);
  });
});
