/**
 * Kill the spawned figma-console-mcp subtree when this engine goes away.
 *
 * Why this is needed at all — the child is not one process but four:
 *
 *   engine
 *    └─ cmd.exe          "npx -y figma-console-mcp@latest"   ← the only PID
 *        └─ npx                                                 the SDK owns
 *            └─ cmd.exe  "figma-console-mcp"
 *                └─ local.js   ← binds the Bridge WebSocket port (9223-9232)
 *
 * `StdioClientTransport.close()` does `stdin.end()` → SIGTERM → SIGKILL, but
 * all of that lands on the outer `cmd.exe` only. On Windows a killed cmd.exe
 * does not take its children with it, so `local.js` survives, keeps the port
 * bound, and keeps refreshing its advertisement file. The next engine then
 * falls back to 9224 while the Figma plugin is still talking to the orphan on
 * 9223 — which presents as "the Bridge broke after a restart".
 *
 * Nothing calls `transport.close()` in this engine either, so even the partial
 * cleanup never ran. Hence: kill the whole tree, explicitly, on every exit
 * path we can observe.
 *
 * Measured on Windows 2026-08-11: `taskkill /PID <engine>` without `/F` is
 * refused outright — a console process with no window cannot be asked to exit
 * politely. The MCP host has to hard-kill us, and a hard kill runs none of the
 * hooks below. They are still worth registering (they cover a self-initiated
 * `process.exit`, an uncaught exception, and POSIX hosts that do send SIGTERM),
 * but they are NOT what fixes the orphan problem — nothing that runs at death
 * time can be. Recovery happens at the next startup instead, in
 * reclaimPorts.ts, which needs no cooperation from the process that died.
 */

import { spawnSync } from 'node:child_process';

export interface KillResult {
  status: number | null;
  output: string;
  error: string;
}

/**
 * Kill `pid` and every descendant, synchronously.
 *
 * Synchronous on purpose: `process.on('exit')` cannot await anything, and that
 * is the one hook guaranteed to run on a normal exit.
 */
export function killProcessTree(pid: number): KillResult {
  if (process.platform === 'win32') {
    // /T = tree, /F = force. Both matter: without /T only cmd.exe dies, and
    // without /F cmd.exe ignores the request.
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      encoding: 'utf-8',
      windowsHide: true
    });
    return {
      status: r.status,
      output: (r.stdout ?? '').trim(),
      error: (r.stderr ?? '').trim() || (r.error ? r.error.message : '')
    };
  }
  // POSIX: the SDK spawns without `detached`, so there is no process group of
  // our own to signal. Killing the direct child is the best we can do without
  // reimplementing spawn; npx does forward signals to its child there.
  try {
    process.kill(pid, 'SIGKILL');
    return { status: 0, output: '', error: '' };
  } catch (e) {
    return { status: null, output: '', error: (e as Error).message };
  }
}

/**
 * Register cleanup for `pid` on every exit path this process can observe.
 *
 * Returns a function that performs the cleanup immediately (used by the
 * transport error handlers, which exit explicitly).
 */
export function installChildCleanup(pid: number): () => void {
  let done = false;
  const cleanup = (): void => {
    if (done) return;
    done = true;
    killProcessTree(pid);
  };

  process.on('exit', cleanup);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGBREAK'] as const) {
    process.on(sig, () => {
      cleanup();
      process.exit(0);
    });
  }
  process.on('uncaughtException', (err) => {
    process.stderr.write(
      `[figma-interaction-doc-engine] uncaught: ${err.stack ?? err}\n`
    );
    cleanup();
    process.exit(1);
  });

  return cleanup;
}
