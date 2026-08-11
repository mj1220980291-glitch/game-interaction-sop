/**
 * Reclaim Bridge ports held by orphaned figma-console-mcp processes.
 *
 * Why this exists — the engine cannot clean up after itself. Measured on
 * Windows 2026-08-11: `taskkill /PID <engine>` without `/F` is refused
 * ("只能强行终止这个进程(带 /F 选项)") because a console process with no window
 * has no graceful termination channel. The MCP host therefore hard-kills the
 * engine, and a hard kill runs no exit handler. The child chain
 *
 *   npx → cmd.exe → local.js
 *
 * then dies from the top down as each stdin closes — except `local.js`, which
 * ignores stdin EOF. It survives, keeps port 9223 bound, and keeps refreshing
 * its advertisement file. The next engine's child finds 9223 taken, falls back
 * to 9224, and the Figma plugin is left talking to a corpse. The user sees
 * "the Bridge broke after restarting".
 *
 * Cleanup on the way out was tried and abandoned: it depends on the engine
 * being alive at the moment of death, which is precisely what is not true.
 * Reclaiming on the way IN needs no cooperation from the dying process and
 * also heals crashes, power loss and kill -9.
 *
 * The orphan test is the parent link. An orphan's parent (`cmd.exe` or `npx`)
 * has already exited, so its PPID points at nothing. A legitimate second
 * figma-console MCP server that the user configured separately still has a
 * live parent chain up to the MCP host, and is therefore left alone — it only
 * gets the warning from detectExternal.ts.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { killProcessTree } from './childLifecycle.js';

const FILE_PREFIX = 'figma-console-mcp-';
const FILE_SUFFIX = '.json';

/** pid → ppid for every live process, or undefined when unavailable. */
export function readProcessTable(): Map<number, number> | undefined {
  if (process.platform === 'win32') {
    const r = spawnSync(
      'wmic',
      ['process', 'get', 'ProcessId,ParentProcessId', '/format:csv'],
      { encoding: 'utf-8', windowsHide: true }
    );
    if (r.status !== 0 || !r.stdout) return undefined;
    const table = new Map<number, number>();
    for (const line of r.stdout.split(/\r?\n/)) {
      // Node,ParentProcessId,ProcessId
      const cols = line.split(',');
      if (cols.length < 3) continue;
      const ppid = Number(cols[cols.length - 2]);
      const pid = Number(cols[cols.length - 1]);
      if (Number.isFinite(pid) && Number.isFinite(ppid)) table.set(pid, ppid);
    }
    return table.size > 0 ? table : undefined;
  }

  const r = spawnSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf-8' });
  if (r.status !== 0 || !r.stdout) return undefined;
  const table = new Map<number, number>();
  for (const line of r.stdout.split('\n')) {
    const m = line.trim().split(/\s+/);
    const pid = Number(m[0]);
    const ppid = Number(m[1]);
    if (Number.isFinite(pid) && Number.isFinite(ppid)) table.set(pid, ppid);
  }
  return table.size > 0 ? table : undefined;
}

/**
 * True when `pid` is alive but its parent is not — i.e. it was left behind by
 * a process that is already gone.
 *
 * On POSIX an orphan is reparented to init, so ppid 1 (or 0) is the signal
 * there; on Windows the PPID simply stops resolving.
 */
export function isOrphan(pid: number, table: Map<number, number>): boolean {
  const ppid = table.get(pid);
  if (ppid === undefined) return false; // not running at all
  if (ppid === 0) return true;
  if (process.platform !== 'win32' && ppid === 1) return true;
  return !table.has(ppid);
}

export interface ReclaimResult {
  killed: Array<{ pid: number; port: number | undefined }>;
  skipped: Array<{ pid: number; port: number | undefined; reason: string }>;
}

/**
 * Kill orphaned figma-console-mcp processes advertised in tmpdir and remove
 * their stale advertisement files. Call before spawning our own child so it
 * can take the preferred port.
 *
 * Best-effort throughout: an unreadable advert, an unavailable process table
 * or a failed kill all degrade to "leave it alone".
 */
export function reclaimOrphanedBridgePorts(): ReclaimResult {
  const result: ReclaimResult = { killed: [], skipped: [] };

  const dir = tmpdir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return result;
  }

  const adverts = entries.filter(
    (n) => n.startsWith(FILE_PREFIX) && n.endsWith(FILE_SUFFIX)
  );
  if (adverts.length === 0) return result;

  const table = readProcessTable();
  if (!table) return result;

  for (const name of adverts) {
    const full = join(dir, name);
    let pid: number | undefined;
    let port: number | undefined;
    try {
      const ad = JSON.parse(readFileSync(full, 'utf-8')) as {
        pid?: number;
        port?: number;
      };
      pid = ad.pid;
      port = ad.port;
    } catch {
      continue;
    }
    if (pid == null) continue;

    if (!table.has(pid)) {
      // Process is gone; the advert is litter that misleads the plugin's scan.
      try {
        // Only remove clearly stale files (>1 min) to avoid racing a starting
        // instance that has written its advert but not yet been listed.
        if (Date.now() - statSync(full).mtimeMs > 60_000) unlinkSync(full);
      } catch {
        /* ignore */
      }
      continue;
    }

    if (!isOrphan(pid, table)) {
      result.skipped.push({ pid, port, reason: 'has a live parent' });
      continue;
    }

    const kill = killProcessTree(pid);
    if (kill.status === 0) {
      result.killed.push({ pid, port });
      try {
        unlinkSync(full);
      } catch {
        /* ignore */
      }
    } else {
      result.skipped.push({ pid, port, reason: `taskkill failed: ${kill.error}` });
    }
  }

  return result;
}
