#!/usr/bin/env node
/**
 * cleanup-orphan-mcp — kill orphan figma-console-mcp processes.
 *
 * Spec: openspec/changes/proxy-figma-console-tools-from-engine/tasks.md (8.x)
 *
 * Background: each `npx -y figma-console-mcp@latest` invocation spawns a
 * stack of three processes on Windows (cmd → npx → node), and crashed /
 * abandoned MCP host configurations leave them around. After enough
 * disable/enable cycles, single-machine accumulations of 30+ orphans have
 * been observed in real use, all holding ports in 9223-9232.
 *
 * This script lists every running figma-console-mcp process and, optionally
 * with `--force`, kills the whole tree. It does NOT touch processes that
 * are direct children of an active node MCP host (figma-interaction-doc-engine)
 * — those are presumed to be intentionally running.
 *
 * Usage:
 *   node scripts/cleanup-orphan-mcp.mjs            # dry-run, list only
 *   node scripts/cleanup-orphan-mcp.mjs --force    # kill them all
 *
 * Exit codes:
 *   0 — listed (and possibly killed) without errors
 *   1 — encountered errors enumerating or killing
 *
 * Cross-platform note: implemented for Windows via PowerShell. macOS/Linux
 * support is a TODO; prefer `pkill -f figma-console-mcp` on those platforms.
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import process from 'node:process';

const FORCE = process.argv.includes('--force');

function listProcessesWindows() {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*figma-console-mcp*' -and $_.CommandLine -notlike '*cleanup-orphan-mcp*' } | ForEach-Object { '{0}|{1}|{2}' -f $_.ProcessId, $_.ParentProcessId, ($_.CommandLine -replace '\\|','/') }`;
  const out = execSync(`powershell -nop -c "${ps.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8'
  });
  const rows = out.split(/\r?\n/).filter(Boolean);
  return rows.map((r) => {
    const [pid, ppid, cmd] = r.split('|');
    return { pid: Number(pid), ppid: Number(ppid), cmd: (cmd ?? '').trim() };
  });
}

function killWindows(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (platform() !== 'win32') {
    console.error(
      '[cleanup-orphan-mcp] only Windows is implemented; on macOS/Linux use:'
    );
    console.error('  pkill -f figma-console-mcp');
    process.exit(1);
  }

  const procs = listProcessesWindows();
  if (procs.length === 0) {
    console.log('[cleanup-orphan-mcp] no figma-console-mcp processes detected.');
    return;
  }

  console.log(
    `[cleanup-orphan-mcp] found ${procs.length} process(es) referencing figma-console-mcp:`
  );
  for (const p of procs) {
    const head = p.cmd.length > 90 ? `${p.cmd.slice(0, 90)}...` : p.cmd;
    console.log(`  pid=${p.pid} parent=${p.ppid}  ${head}`);
  }

  if (!FORCE) {
    console.log('');
    console.log('Dry-run only. Re-run with --force to kill all listed processes.');
    return;
  }

  let failed = 0;
  for (const p of procs) {
    const ok = killWindows(p.pid);
    console.log(`  ${ok ? 'killed' : 'failed'} pid=${p.pid}`);
    if (!ok) failed++;
  }
  console.log(`[cleanup-orphan-mcp] done. failures=${failed}`);
  if (failed > 0) process.exit(1);
}

main();
