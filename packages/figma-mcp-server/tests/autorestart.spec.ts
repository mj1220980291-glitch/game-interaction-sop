/**
 * 开发期自动重启：dist 变了就退出，让下次工具调用拉起新进程。
 *
 * Spec: 无（开发体验，不影响渲染 / 编译行为）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installAutoRestart } from '../src/server/autoRestart.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autorestart-'));
  fs.writeFileSync(path.join(dir, 'a.js'), '// 1');
  process.env.GAME_SOP_AUTORESTART = '1';
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.GAME_SOP_AUTORESTART;
});

async function waitFor(fn: () => boolean, timeoutMs = 4000): Promise<void> {
  const startedAt = Date.now();
  while (!fn()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('timeout waiting for reload');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('installAutoRestart', () => {
  it('产物变化时触发重启回调', async () => {
    let reloads = 0;
    const stop = installAutoRestart({ distRoot: dir, debounceMs: 50, onReload: () => (reloads += 1) });

    fs.writeFileSync(path.join(dir, 'a.js'), '// 2');
    await waitFor(() => reloads > 0);

    stop();
    expect(reloads).toBeGreaterThan(0);
  });

  it('非 .js 变化不触发', async () => {
    let reloads = 0;
    const stop = installAutoRestart({ distRoot: dir, debounceMs: 50, onReload: () => (reloads += 1) });

    fs.writeFileSync(path.join(dir, 'a.d.ts'), '// types only');
    await new Promise((r) => setTimeout(r, 300));

    stop();
    expect(reloads).toBe(0);
  });

  it('连续写入只重启一次', async () => {
    let reloads = 0;
    const stop = installAutoRestart({ distRoot: dir, debounceMs: 120, onReload: () => (reloads += 1) });

    for (let i = 0; i < 5; i += 1) fs.writeFileSync(path.join(dir, 'a.js'), `// ${i}`);
    await waitFor(() => reloads > 0);
    await new Promise((r) => setTimeout(r, 400));

    stop();
    expect(reloads).toBe(1);
  });

  it('默认关闭（不设环境变量时不安装）', async () => {
    delete process.env.GAME_SOP_AUTORESTART;
    let reloads = 0;
    const stop = installAutoRestart({ distRoot: dir, debounceMs: 50, onReload: () => (reloads += 1) });

    fs.writeFileSync(path.join(dir, 'a.js'), '// 2');
    await new Promise((r) => setTimeout(r, 300));

    stop();
    expect(reloads).toBe(0);
  });
});
