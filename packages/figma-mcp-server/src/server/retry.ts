/**
 * 发布后的「假死」重试。
 *
 * 真机现象：库刚发布完，Figma 后台还在同步，`importComponentByKeyAsync` 会卡住
 * 30–40 秒然后超时。这不是真的失败——等几秒再来一次就好（今天为此白跑了 3~4 轮：
 * 失败 → 人肉清残留 → 再跑）。所以这类超时统一重试，别让整轮渲染白费。
 */

/** 只有「连接类」错误才重试；「没发布」「找不到」这种重试也没用。 */
export function isTransientBridgeError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error ?? '');
  return /timed out|timeout|Unable to establish connection|Connection closed|ECONNRESET|EPIPE/i.test(
    message
  );
}

export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  log?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

export async function retryTransient<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 4000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? (() => {});

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientBridgeError(error)) throw error;
      log(
        `bridge hiccup (attempt ${attempt}/${attempts}): ` +
          `${(error as Error).message} — retrying in ${delayMs}ms`
      );
      await sleep(delayMs);
    }
  }
  throw lastError;
}
