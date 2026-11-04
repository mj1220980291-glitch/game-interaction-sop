/**
 * Bridge 所有权诊断与 supervisor 单例。
 *
 * 真机（2026-11-03）：`render` 报 `Cannot connect` 而代理工具正常，原因是子进程
 * 静默退到备用端口；另一处是两份 supervisor 双活，工具落旧进程 → 「升级无效」。
 *
 * 这一层锁的是「错误信息能不能直接指认端口归属」与「第二份 supervisor 会不会让位」。
 * Spec: engine-mcp-server（bridge 诊断）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acquireSupervisorLock,
  bridgeCleanupHint,
  describeBridgeFailure,
  describeNoReply,
  getBridgeState,
  pidAlive,
  readSupervisorLock,
  releaseSupervisorLock,
  setBridgeState
} from '../../src/server/bridgeState.js';

describe('bridge 诊断', () => {
  beforeEach(() => {
    setBridgeState({
      port: 9223,
      preferredPort: 9223,
      fallback: false,
      holderPid: undefined,
      recovery: undefined,
      pluginConnected: undefined,
      lastRoundtripMs: undefined
    });
  });

  it('端口正确但插件没回话时给出第三态诊断（2026-11-04 真机）', () => {
    const text = describeBridgeFailure('figma_execute failed: Cannot connect to Figma Desktop')!;
    expect(text).toContain('9223');
    expect(text).toContain(`pid=${process.pid}`);
    expect(text).toContain('关掉插件再重新运行');
    // 不能把「插件没接入」说成端口冲突
    expect(text).not.toContain('端口冲突');
  });

  it('退到备用端口时给出版本归属与占用者', () => {
    setBridgeState({ port: 9224, fallback: true, holderPid: 51292 });
    const text = describeBridgeFailure('figma_execute failed: Cannot connect to Figma Desktop')!;
    expect(text).toContain('9224');
    expect(text).toContain('9223');
    expect(text).toContain('51292');
    expect(text).toContain(`pid=${process.pid}`);
  });

  it('无回程诊断与「没有插件客户端」分开', () => {
    const text = describeNoReply(20000);
    expect(text).toContain('20000ms');
    expect(text).toContain('sandbox');
    expect(text).toContain('关掉插件再重新运行');
  });

  it('探活结论进状态', () => {
    setBridgeState({ pluginConnected: true, lastRoundtripMs: 37 });
    expect(getBridgeState().pluginConnected).toBe(true);
    expect(getBridgeState().lastRoundtripMs).toBe(37);
  });

  it('恢复结果进诊断', () => {
    setBridgeState({ port: 9223, fallback: true, recovery: 'reclaimPreferredPort=reclaimed pid=42' });
    expect(describeBridgeFailure('Cannot connect')!).toContain('reclaimPreferredPort=reclaimed');
  });

  it('非连接类错误不掺端口信息', () => {
    setBridgeState({ fallback: true });
    expect(describeBridgeFailure('node not found: 1:2')).toBeUndefined();
  });

  it('清理指引覆盖两个平台', () => {
    expect(bridgeCleanupHint()).toContain('netstat -ano');
    expect(bridgeCleanupHint()).toContain('lsof');
  });

  it('getBridgeState 带 enginePid，supervisorPid 从环境读', () => {
    const prev = process.env.GISOP_SUPERVISOR_PID;
    process.env.GISOP_SUPERVISOR_PID = '4242';
    try {
      const s = getBridgeState();
      expect(s.enginePid).toBe(process.pid);
      expect(s.supervisorPid).toBe(4242);
    } finally {
      if (prev === undefined) delete process.env.GISOP_SUPERVISOR_PID;
      else process.env.GISOP_SUPERVISOR_PID = prev;
    }
  });
});

describe('supervisor 单例锁', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gisop-lock-'));
    file = path.join(dir, 'supervisor.lock');
  });

  afterEach(() => {
    releaseSupervisorLock(file);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('首次抢锁成功并写入自己的 pid', () => {
    expect(acquireSupervisorLock(file)).toEqual({ ok: true });
    expect(readSupervisorLock(file)?.pid).toBe(process.pid);
  });

  it('活着且不是自己的所有者 → 让位', () => {
    fs.writeFileSync(file, JSON.stringify({ pid: 999999, startedAt: 'x' }));
    // 999999 通常不存在；用当前进程 pid 模拟「另一份活着的 supervisor」
    const holder = process.ppid;
    fs.writeFileSync(file, JSON.stringify({ pid: holder, startedAt: 'x' }));
    const got = acquireSupervisorLock(file);
    expect(got).toEqual({ ok: false, holderPid: holder });
  });

  it('锁文件里的 pid 已死 → 直接覆盖', () => {
    const dead = 0x7ffffffe;
    fs.writeFileSync(file, JSON.stringify({ pid: dead, startedAt: 'x' }));
    expect(pidAlive(dead)).toBe(false);
    expect(acquireSupervisorLock(file)).toEqual({ ok: true });
    expect(readSupervisorLock(file)?.pid).toBe(process.pid);
  });

  it('坏文件不阻断启动', () => {
    fs.writeFileSync(file, 'not json');
    expect(acquireSupervisorLock(file)).toEqual({ ok: true });
  });

  it('释放只删自己的锁', () => {
    fs.writeFileSync(file, JSON.stringify({ pid: process.ppid, startedAt: 'x' }));
    releaseSupervisorLock(file);
    expect(readSupervisorLock(file)?.pid).toBe(process.ppid);
  });
});
