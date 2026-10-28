/**
 * 编译期耗时trace —— 只为排「桥接 10 秒超时」这类真机问题。
 *
 * 插件侧无法打日志（bridge 只回传结果），所以由引擎把每个 RPC 的名字与耗时
 * 追加到 `%TEMP%/gisop-compile.log`。排完问题可以整块删掉。
 */

import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOG = join(tmpdir(), 'gisop-compile.log');

export function trace(message: string): void {
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* 日志失败不能影响编译 */
  }
}

export function tracePath(): string {
  return LOG;
}
