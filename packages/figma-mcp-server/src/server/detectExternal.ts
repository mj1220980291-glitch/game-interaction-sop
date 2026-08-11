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
 * is not from the child this engine just spawned is reported on stderr.
 *
 * Identifying "ours" by PID does not work: the SDK spawns `cmd.exe`, and the
 * process that binds the port and writes the advertisement is `local.js`, two
 * levels below. The two PIDs never match, so a naive `ad.pid === ourChildPid`
 * check flags the engine's own child as external on every single startup.
 *
 * The advertisement's `startedAt` is a reliable discriminator instead: our
 * child is necessarily younger than the engine, so anything advertising a
 * start time from before this process booted belongs to someone else — either
 * a second figma-console MCP server the user configured, or an orphan left
 * behind by a previous engine that is still squatting the port.
 *
 * @param ourChildPid PID of the process the SDK spawned. Only used as a
 *                    secondary exclusion; usually matches nothing.
 * @param engineStartedAtMs Epoch ms when this engine process booted.
 */
export function warnOnExternalFigmaConsoleInstances(
  ourChildPid: number | undefined,
  engineStartedAtMs: number = Date.now() - process.uptime() * 1000
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
    if (ad.pid == null) return false;
    if (ourChildPid != null && ad.pid === ourChildPid) return false;
    // Younger than the engine ⇒ it is the child we just spawned.
    const startedAt = ad.startedAt ? Date.parse(ad.startedAt) : NaN;
    if (!Number.isNaN(startedAt) && startedAt >= engineStartedAtMs) return false;
    return true;
  });

  if (externals.length === 0) return;

  for (const { ad, file } of externals) {
    const port = ad.port ?? '?';
    const pid = ad.pid ?? '?';
    const started = ad.startedAt ?? '?';
    process.stderr.write(
      `[figma-interaction-doc-engine] WARNING: a figma-console-mcp that predates ` +
        `this engine is still running (port=${port}, pid=${pid}, started=${started}, ` +
        `advert=${file}). The Figma Desktop Bridge plugin may be connected to it ` +
        `instead of our child, which looks like "the Bridge stopped working". ` +
        `It is either a second figma-console MCP server in your CodeMaker config, ` +
        `or an orphan from a previous engine — in the latter case ` +
        `\`taskkill /F /T /PID ${pid}\` clears it.\n`
    );
  }
}
