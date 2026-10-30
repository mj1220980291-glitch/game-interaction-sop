/**
 * Bridge 端口占用的解析与同类进程判定。
 *
 * 这些函数只吃命令输出字符串，不碰系统状态——端口抢占的逻辑必须能在没有
 * Figma、没有 Windows netstat 的环境里回归。
 *
 * Spec: openspec/changes/bridge-port-stability
 */

import { describe, it, expect } from 'vitest';
import {
  parseNetstatListeners,
  parseLsofListeners,
  looksLikeFigmaConsole
} from '../../src/server/reclaimPorts.js';

describe('parseNetstatListeners', () => {
  it('只取 LISTENING 行、末列 pid', () => {
    const out = [
      '活动连接',
      '',
      '  协议  本地地址          外部地址        状态           PID',
      '  TCP    0.0.0.0:9223    0.0.0.0:0    LISTENING    5052',
      '  TCP    0.0.0.0:9224    0.0.0.0:0    LISTENING    6060',
      '  TCP    127.0.0.1:9223   127.0.0.1:50123  ESTABLISHED  5052'
    ].join('\r\n');
    expect(parseNetstatListeners(out, 9223)).toEqual([5052]);
    expect(parseNetstatListeners(out, 9224)).toEqual([6060]);
  });

  it('端口号前缀相同的行不会误命中', () => {
    const out = '  TCP    0.0.0.0:92230    0.0.0.0:0    LISTENING    777';
    expect(parseNetstatListeners(out, 9223)).toEqual([]);
  });

  it('同一端口多个监听者去重', () => {
    const out = [
      '  TCP    0.0.0.0:9223    0.0.0.0:0    LISTENING    55',
      '  TCP    [::]:9223       [::]:0       LISTENING    55'
    ].join('\n');
    expect(parseNetstatListeners(out, 9223)).toEqual([55]);
  });

  it('垃圾输出返回空', () => {
    expect(parseNetstatListeners('', 9223)).toEqual([]);
    expect(parseNetstatListeners('no such command', 9223)).toEqual([]);
  });
});

describe('parseLsofListeners', () => {
  it('每行一个 pid', () => {
    expect(parseLsofListeners('5052\n6060\n')).toEqual([5052, 6060]);
  });

  it('空行与非数字忽略', () => {
    expect(parseLsofListeners('\n  \nabc\n')).toEqual([]);
  });
});

describe('looksLikeFigmaConsole', () => {
  it('npx 形态', () => {
    expect(looksLikeFigmaConsole('npx -y figma-console-mcp@latest')).toBe(true);
  });

  it('node 直接跑 local.js', () => {
    expect(
      looksLikeFigmaConsole('node C:\\x\\node_modules\\figma-console-mcp\\dist\\local.js')
    ).toBe(true);
  });

  it('无关 node 进程', () => {
    expect(looksLikeFigmaConsole('node server.js')).toBe(false);
    expect(looksLikeFigmaConsole('')).toBe(false);
    expect(looksLikeFigmaConsole('mcp-server-for-something')).toBe(false);
  });
});
