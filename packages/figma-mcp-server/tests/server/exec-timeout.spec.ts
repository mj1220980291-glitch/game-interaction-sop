/**
 * 客户端侧 exec 上限与探活状态。
 *
 * 真机（2026-11-04）：插件 socket 还在、sandbox 假死时，`figma_execute` 没有回程，
 * `client.callTool` 挂到 figma-console 连接层的 60s，正好等于宿主「请求超时 →
 * 重启整个 MCP」的阈值：每次渲染都干等 60s，然后 `enginePid` 变了。
 *
 * 这一层锁两件事：上限预算是「插件 timeout + 5s」、超时给专属错误码 `V2_BRIDGE_NO_REPLY`。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  buildFigmaConsoleBackend,
  execBudget,
  withExecBudget
} from '../../src/server/figmaConsoleBackend.js';
import { getBridgeState, NO_REPLY_CODE, setBridgeState } from '../../src/server/bridgeState.js';

function clientReturning(payload: unknown): Client {
  return {
    async callTool() {
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
  } as unknown as Client;
}

function clientHanging(): Client {
  return {
    callTool() {
      return new Promise(() => {});
    }
  } as unknown as Client;
}

describe('exec 预算', () => {
  const prev = process.env.GISOP_EXEC_TIMEOUT_MS;

  afterEach(() => {
    if (prev === undefined) delete process.env.GISOP_EXEC_TIMEOUT_MS;
    else process.env.GISOP_EXEC_TIMEOUT_MS = prev;
  });

  it('默认是插件 timeout + 5s', () => {
    delete process.env.GISOP_EXEC_TIMEOUT_MS;
    expect(execBudget(15000)).toBe(20000);
    expect(execBudget(5000)).toBe(10000);
  });

  it('GISOP_EXEC_TIMEOUT_MS 可覆盖', () => {
    process.env.GISOP_EXEC_TIMEOUT_MS = '1234';
    expect(execBudget(15000)).toBe(1234);
  });

  it('超时抛 V2_BRIDGE_NO_REPLY，不等 60s', async () => {
    process.env.GISOP_EXEC_TIMEOUT_MS = '30';
    const startedAt = Date.now();
    await expect(withExecBudget(new Promise(() => {}), execBudget(15000))).rejects.toMatchObject({
      code: NO_REPLY_CODE
    });
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('正常返回不触发超时', async () => {
    await expect(withExecBudget(Promise.resolve(7), 50)).resolves.toBe(7);
  });
});

describe('探活把结论写进 bridgeState', () => {
  beforeEach(() => {
    setBridgeState({
      port: 9223,
      preferredPort: 9223,
      fallback: false,
      holderPid: undefined,
      pluginConnected: undefined,
      lastRoundtripMs: undefined
    });
  });

  it('回环成功 → pluginConnected=true 且记录往返耗时', async () => {
    const backend = buildFigmaConsoleBackend(
      clientReturning({ _mcp: 'figma-console-mcp', success: true, result: 1 })
    );
    await backend.healthCheck!();
    const s = getBridgeState();
    expect(s.pluginConnected).toBe(true);
    expect(typeof s.lastRoundtripMs).toBe('number');
  });

  it('没有插件客户端 → pluginConnected=false，诊断指向插件没接入', async () => {
    const backend = buildFigmaConsoleBackend(
      clientReturning({
        _mcp: 'figma-console-mcp',
        success: false,
        error: 'Cannot connect to Figma Desktop'
      })
    );
    await expect(backend.healthCheck!()).rejects.toThrow(/关掉插件再重新运行/);
    const s = getBridgeState();
    expect(s.pluginConnected).toBe(false);
    expect(s.lastRoundtripMs).toBeUndefined();
  });

  it('socket 在但不回话 → V2_BRIDGE_NO_REPLY，pluginConnected 保持 true', async () => {
    const prev = process.env.GISOP_EXEC_TIMEOUT_MS;
    process.env.GISOP_EXEC_TIMEOUT_MS = '30';
    try {
      const backend = buildFigmaConsoleBackend(clientHanging());
      await expect(backend.healthCheck!()).rejects.toMatchObject({ code: NO_REPLY_CODE });
      const s = getBridgeState();
      // 有客户端、但沙箱不回话 —— 与「插件没开」是两种失败
      expect(s.pluginConnected).toBe(true);
      expect(s.lastRoundtripMs).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.GISOP_EXEC_TIMEOUT_MS;
      else process.env.GISOP_EXEC_TIMEOUT_MS = prev;
    }
  });
});
