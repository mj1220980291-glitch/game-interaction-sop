/**
 * 可替换 worker 的生命周期。
 *
 * 为什么需要它：引擎改一次代码就要人工重启一次（CodeMaker 不会拉起已退出的 MCP
 * 进程，实测）。进程内热加载也不行（ESM 缓存 + stdio 会话状态），所以拆成
 * 「常驻父进程持有会话 + 可替换业务 worker」：`dist` 一变就换 worker，客户端无感。
 *
 * 这里只管理生命周期，不碰 MCP 协议，方便单测。
 */

export interface WorkerHandle {
  /** 停掉这个 worker，等它真的退出。 */
  stop(): Promise<void>;
}

export interface WorkerLoop {
  /** 当前在跑的那个 worker（还没起来时为 undefined）。 */
  current(): WorkerHandle | undefined;
  /** 换一个新的 worker；失败时保留旧的并抛错。 */
  restart(reason: string): Promise<void>;
  /** 停掉 worker 且不再换新的。 */
  shutdown(): Promise<void>;
}

export interface WorkerLoopOptions {
  /** 起一个 worker（例如 spawn 子进程并连上 MCP）。 */
  spawn: () => Promise<WorkerHandle>;
  /** 新 worker 就绪后回调（例如刷新工具表）。 */
  onSwap?: (handle: WorkerHandle, reason: string) => void | Promise<void>;
  log?: (message: string) => void;
}

/**
 * 串行化重启：`build` 会连续触发多次文件变更，并发换 worker 会同时起两个、
 * 抢 Bridge 端口（真机上表现为插件连到已死的那个）。
 */
export function createWorkerLoop(opts: WorkerLoopOptions): WorkerLoop {
  const log = opts.log ?? (() => {});
  let handle: WorkerHandle | undefined;
  let queue: Promise<void> = Promise.resolve();
  let stopped = false;

  const run = (fn: () => Promise<void>): Promise<void> => {
    queue = queue.then(fn, fn);
    return queue;
  };

  return {
    current: () => handle,

    restart(reason: string): Promise<void> {
      return run(async () => {
        if (stopped) return;
        const next = await opts.spawn();
        const previous = handle;
        handle = next;
        if (previous) {
          try {
            await previous.stop();
          } catch (err) {
            log(`old worker stop failed: ${(err as Error).message}`);
          }
        }
        log(`worker swapped (${reason})`);
        await opts.onSwap?.(next, reason);
      });
    },

    shutdown(): Promise<void> {
      return run(async () => {
        stopped = true;
        const previous = handle;
        handle = undefined;
        if (previous) await previous.stop();
      });
    }
  };
}
