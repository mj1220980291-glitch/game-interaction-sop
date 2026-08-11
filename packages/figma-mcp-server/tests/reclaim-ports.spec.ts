/**
 * Bug B — 引擎被强杀后，figma-console-mcp 的 `local.js` 活下来霸占 Bridge 端口。
 *
 * 死时清理走不通：Windows 上无窗口控制台进程只能被强杀（实测 `taskkill` 不带
 * `/F` 直接被拒），强杀不跑任何 handler。所以改成启动时回收。
 *
 * 判据是父进程链：孤儿的父已经退出，而用户另外配置的一份 figma-console MCP
 * 其父链完整通到 MCP host，必须留活口。这里锁的就是这个判据。
 */

import { describe, it, expect } from 'vitest';
import { isOrphan } from '../src/server/reclaimPorts.js';

describe('isOrphan — 区分孤儿与合法的第二实例', () => {
  it('父进程不在进程表里 → 孤儿', () => {
    // local.js(3000) 的父 cmd.exe(2000) 已经因 stdin EOF 退出。
    const table = new Map([[3000, 2000]]);
    expect(isOrphan(3000, table)).toBe(true);
  });

  it('父进程还活着 → 不是孤儿，绝不能杀', () => {
    // language-server(100) → npx(200) → local.js(3000)，整条链都在。
    const table = new Map([
      [100, 1],
      [200, 100],
      [3000, 200]
    ]);
    expect(isOrphan(3000, table)).toBe(false);
  });

  it('进程本身不存在 → 不是孤儿（没什么可杀的）', () => {
    expect(isOrphan(3000, new Map([[100, 1]]))).toBe(false);
  });

  it('ppid 为 0 → 孤儿', () => {
    expect(isOrphan(3000, new Map([[3000, 0]]))).toBe(true);
  });

  it('祖父死了但父还活着 → 不是孤儿，只看直接父', () => {
    // 判据故意只看一层：父活着就说明这条 stdio 链还有人管。
    const table = new Map([
      [200, 100], // 100 已不在表里
      [3000, 200]
    ]);
    expect(isOrphan(3000, table)).toBe(false);
  });
});
