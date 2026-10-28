/**
 * 入口冒烟：`node dist/server/index.js` 必须能起来。
 *
 * 为什么需要：单元测试跑的是 TS 源码（vite 会代劳 ESM 细节），而真机跑的是
 * `dist` 里的 ESM。曾经的 `__dirname is not defined` 就是这样漏过去的——
 * 测试全绿，插件却「连接失败」。
 *
 * dist 不存在（没 build）时跳过。
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'dist', 'server', 'index.js');
const hasDist = fs.existsSync(ENTRY);

describe.skipIf(!hasDist)('dist 入口冒烟', () => {
  it('能在 stdin 关闭后正常退出，不出现启动期异常', async () => {
    const child = spawn(process.execPath, [ENTRY], {
      cwd: ROOT,
      // 不配 FIGMA_BACKEND：跳过 figma-console 子进程，只验 ESM 加载与 stdio 绑定。
      env: { ...process.env, FIGMA_BACKEND: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));

    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`entry did not exit within 10s; stderr:\n${stderr}`));
      }, 10_000);
      child.on('error', reject);
      child.on('exit', (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });

    expect(stderr).not.toContain('ReferenceError');
    expect(stderr).not.toContain('failed to start');
    // 入口是常驻父进程：它自己应答会话，业务在 worker 里。
    expect(stderr).toContain('supervisor ready');
    expect(stderr).toContain('worker ready');
    expect(code === 0 || code === 1).toBe(true);
  });
});
