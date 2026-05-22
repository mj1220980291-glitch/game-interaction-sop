/**
 * Detect external `figma-console-mcp` instances that we don't own.
 *
 * Spec: openspec/changes/proxy-figma-console-tools-from-engine/specs/engine-mcp-server/spec.md
 *       (Requirement: "Detect and warn about extra figma-console-mcp instances")
 *
 * Background: `figma-console-mcp` writes a port advertisement file at
 *   `<os.tmpdir>/figma-console-mcp-{port}.json`
 * each time an instance binds a WebSocket port (range 9223-9232). The
 * Figma Desktop Bridge plugin scans these files and connects to the first
 * responding server.
 *
 * If a user accidentally keeps a standalone `figma-console` MCP server
 * configured in CodeMaker on top of the bundled child, both processes
 * advertise themselves and the plugin only connects to ONE — typically not
 * ours. The result is silent: render_v2 fails with "Cannot connect to Figma
 * Desktop" and the user has no signal why.
 *
 * This module reads the advertisement files at startup, filters out the
 * engine-spawned child PID, and emits a clear stderr WARNING for every
 * remaining instance so the user can clean it up.
 *
 * Best-effort only: any IO error is swallowed by the caller and logged
 * separately; missing port files = no warnings, which is the correct
 * behavior.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface PortAdvertisement {
  port?: number;
  pid?: number;
  startedAt?: string;
  /** Allow other fields without forcing knowledge of the schema. */
  [k: string]: unknown;
}

const FILE_PREFIX = 'figma-console-mcp-';
const FILE_SUFFIX = '.json';

/**
 * Scan tmpdir for figma-console-mcp port advertisement files. Anything that
 * is not from `ourChildPid` is reported on stderr as a WARNING.
 *
 * @param ourChildPid PID of the child figma-console-mcp this engine just
 *                    spawned. May be undefined when the platform / sdk does
 *                    not expose the PID; in that case we still report all
 *                    detected instances (the user can decide which is which).
 */
export function warnOnExternalFigmaConsoleInstances(
  ourChildPid: number | undefined
): void {
  const dir = tmpdir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  const advertisements: Array<{ file: string; ad: PortAdvertisement }> = [];
  for (const name of entries) {
    if (!name.startsWith(FILE_PREFIX) || !name.endsWith(FILE_SUFFIX)) continue;
    const full = join(dir, name);
    try {
      // Skip stale files older than 24h to avoid false positives. The
      // figma-console-mcp library refreshes lastSeen; very old files are
      // almost certainly orphans or unrelated.
      const stat = statSync(full);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 24 * 60 * 60 * 1000) continue;
      const txt = readFileSync(full, 'utf-8');
      const ad = JSON.parse(txt) as PortAdvertisement;
      advertisements.push({ file: full, ad });
    } catch {
      // unreadable / non-json — skip
    }
  }

  const externals = advertisements.filter(({ ad }) => {
    if (ourChildPid != null && ad.pid === ourChildPid) return false;
    return ad.pid != null;
  });

  if (externals.length === 0) return;

  for (const { ad, file } of externals) {
    const port = ad.port ?? '?';
    const pid = ad.pid ?? '?';
    const started = ad.startedAt ?? '?';
    process.stderr.write(
      `[figma-interaction-doc-engine] WARNING: external figma-console-mcp detected ` +
        `(port=${port}, pid=${pid}, started=${started}, advert=${file}); ` +
        `Figma Desktop Bridge plugin may connect to it instead of the engine's child. ` +
        `Remove the standalone figma-console MCP server from your CodeMaker configuration.\n`
    );
  }
}
