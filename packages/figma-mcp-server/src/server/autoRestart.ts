/**
 * 开发期自动重启 —— `dist` 一变就让进程退出，下次工具调用由 CodeMaker 懒启动新进程。
 *
 * 为什么不是进程内热加载：package 是 ESM，`import('...?v=1')` 只能刷新入口模块本身，
 * 它已经加载的依赖（渲染 / 编译 / 后端）仍然指向缓存里的旧实例；而 stdio MCP 的会话
 * 状态由 CodeMaker 持有，进程内也没法重新握手。重启进程是唯一干净的办法。
 *
 * 为什么进程可以安全退出：`childLifecycle` 会树杀 figma-console 子进程，
 * 新进程启动时 `reclaimOrphanedBridgePorts` 收回 Bridge 端口，插件自动重连。
 *
 * 退出后 CodeMaker **不会**自动拉起（实测：杀掉后工具调用直接报「服务器未连接」），
 * 所以默认关闭，只有设了 `GAME_SOP_AUTORESTART=1` 才装。
 *
 * 真要做到「改完 build 就能用」，方向是常驻父进程 + 可替换的业务子进程
 * （父进程持有 MCP 会话，子进程重编后换掉），见 openspec/changes 里的记录。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 编译产物根目录（dist）。ESM 里没有 `__dirname`，必须从 import.meta.url 推。 */
const DIST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** build 会连续写几十个文件，攒一下再退，避免退在半个构建上。 */
const DEBOUNCE_MS = 800;

export interface AutoRestartOptions {
  distRoot?: string;
  debounceMs?: number;
  /** 测试用：默认是「打一行日志然后退出进程」。 */
  onReload?: () => void;
}

export function installAutoRestart(opts: AutoRestartOptions = {}): () => void {
  if (process.env.GAME_SOP_AUTORESTART !== '1') return () => {};

  const root = opts.distRoot ?? DIST_ROOT;
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  let timer: NodeJS.Timeout | undefined;

  const onExit =
    opts.onReload ??
    ((): void => {
      process.stderr.write(
        '[figma-interaction-doc-engine] dist changed; exiting so the next tool call spawns a fresh engine\n'
      );
      process.exit(0);
    });

  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (filename && !String(filename).endsWith('.js')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(onExit, debounceMs);
    });
  } catch (err) {
    process.stderr.write(
      `[figma-interaction-doc-engine] auto-restart unavailable: ${(err as Error).message}\n`
    );
    return () => {};
  }

  // stdio 传输结束时进程本来就会退，watcher 顺手关掉即可。
  process.on('exit', () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  });

  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}
