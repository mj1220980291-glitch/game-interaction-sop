#!/usr/bin/env node
/**
 * install-mcp — unpack the bundled figma-console-mcp tarball into a
 * stable local directory and print the config snippet the user must
 * paste into their AI agent's MCP config file.
 *
 * Why not auto-edit the agent's config?
 *   Each agent uses a different config format (TOML for Codex, JSON for
 *   Claude/Cursor/Cline, and Cline's file is inside VS Code's extension
 *   storage). Surgically editing these without clobbering the user's
 *   other MCP servers is fragile. We print a clean, copy-pasteable
 *   snippet instead and let the user decide where it goes.
 *
 * Usage:
 *   node scripts/install-mcp.mjs                    # default: prints all agents
 *   node scripts/install-mcp.mjs --agent codex      # print only codex snippet
 *   node scripts/install-mcp.mjs --agent claude
 *   node scripts/install-mcp.mjs --agent cursor
 *   node scripts/install-mcp.mjs --agent cline
 *   node scripts/install-mcp.mjs --dry-run          # don't actually unpack
 *   node scripts/install-mcp.mjs --force            # overwrite existing install
 *   node scripts/install-mcp.mjs --online           # npm-install from registry
 *                                                   # instead of using vendor/
 */

import {
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  cpSync
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SKILL_DIR = resolve(REPO_ROOT, 'packages/skill');

const args = process.argv.slice(2);
const agentFilter = pickArg('--agent', null);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const online = args.includes('--online');

function pickArg(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

function expandHome(p) {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(2));
  }
  return p;
}

// --- Load manifest ------------------------------------------------------

const manifest = JSON.parse(
  readFileSync(join(SKILL_DIR, 'manifest.json'), 'utf8')
);

const mcp = manifest.mcp;
if (!mcp) {
  console.error('[install-mcp] manifest.json has no `mcp` block.');
  process.exit(1);
}

const osKey = platform() === 'win32' ? 'windows' : 'unix';
const installDir = expandHome(mcp.installDir[osKey] ?? mcp.installDir.unix);
const tarballPath = resolve(REPO_ROOT, mcp.tarball);

// --- Unpack (or online-install) -----------------------------------------

console.log(`[install-mcp] package: ${mcp.package}@${mcp.version}`);
console.log(`[install-mcp] mode:    ${online ? 'online (npm registry)' : 'offline (bundled tarball)'}`);
console.log(`[install-mcp] target:  ${installDir}`);

if (!dryRun) {
  if (existsSync(installDir)) {
    if (!force) {
      console.log(
        `[install-mcp] target already exists: ${installDir}\n` +
          `[install-mcp] skipping unpack. Pass --force to reinstall.`
      );
    } else {
      rmSync(installDir, { recursive: true, force: true });
      console.log('[install-mcp] removed existing install.');
    }
  }

  if (!existsSync(installDir)) {
    mkdirSync(installDir, { recursive: true });
    if (online) {
      // npm-install into the target dir; registry access required.
      console.log(`[install-mcp] npm install ${mcp.package}@${mcp.version} ...`);
      execSync(`npm install --prefix "${installDir}" ${mcp.package}@${mcp.version}`, {
        stdio: 'inherit'
      });
      // npm puts the package at installDir/node_modules/<name>
      // Re-home it to installDir/* for a stable layout.
      const fromNm = join(installDir, 'node_modules', mcp.package);
      if (existsSync(fromNm)) {
        cpSyncAll(fromNm, installDir);
        rmSync(join(installDir, 'node_modules'), { recursive: true, force: true });
        try {
          rmSync(join(installDir, 'package.json'), { force: true });
          rmSync(join(installDir, 'package-lock.json'), { force: true });
        } catch {}
      }
    } else {
      if (!existsSync(tarballPath)) {
        console.error(
          `[install-mcp] tarball missing: ${tarballPath}\n` +
            `[install-mcp] run with --online, or re-fetch the tarball:\n` +
            `[install-mcp]   cd vendor && npm pack ${mcp.package}@${mcp.version}`
        );
        process.exit(3);
      }
      console.log(`[install-mcp] extracting ${tarballPath} ...`);
      // `npm pack` tarballs contain a single top-level `package/` dir.
      // We extract into a temp path then move `package/*` into installDir.
      const tmp = installDir + '.unpack';
      mkdirSync(tmp, { recursive: true });
      execSync(`tar -xzf "${tarballPath}" -C "${tmp}"`, { stdio: 'inherit' });
      cpSyncAll(join(tmp, 'package'), installDir);
      rmSync(tmp, { recursive: true, force: true });
    }
    console.log('[install-mcp] ✅ unpacked.');
  }
}

// --- Compute entry + bridge paths ---------------------------------------

const entryAbs = join(installDir, mcp.entry);
const bridgeAbs = join(installDir, mcp.bridgeDir);

// --- Print agent config snippets ----------------------------------------

printBanner();

const agents = agentFilter
  ? [agentFilter]
  : ['codex', 'claude', 'cursor', 'cline'];

for (const agent of agents) {
  printSnippet(agent, entryAbs);
}

printBridgeInstructions(bridgeAbs);

// --- Snippet printers ---------------------------------------------------

function printBanner() {
  const line = '─'.repeat(72);
  console.log('');
  console.log(line);
  console.log('  Paste the snippet for your agent into its MCP config.');
  console.log('  After pasting, restart the agent so it picks up the new server.');
  console.log(line);
}

function printSnippet(agent, entry) {
  const e = JSON.stringify(entry);
  console.log('');
  console.log(`━━━ ${agent} ━━━`);
  switch (agent) {
    case 'codex': {
      console.log('  Config file: ~/.codex/config.toml');
      console.log('  Append:');
      console.log('');
      console.log('    [mcp_servers.figma-console]');
      console.log(`    command = "node"`);
      console.log(`    args    = [${e}]`);
      break;
    }
    case 'claude': {
      console.log('  Config file:');
      console.log('    macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json');
      console.log('    Windows: %APPDATA%\\Claude\\claude_desktop_config.json');
      console.log('  Merge into "mcpServers":');
      console.log('');
      console.log('    {');
      console.log('      "mcpServers": {');
      console.log('        "figma-console": {');
      console.log('          "command": "node",');
      console.log(`          "args": [${e}]`);
      console.log('        }');
      console.log('      }');
      console.log('    }');
      break;
    }
    case 'cursor': {
      console.log('  Config file: ~/.cursor/mcp.json');
      console.log('  Merge into "mcpServers":');
      console.log('');
      console.log('    {');
      console.log('      "mcpServers": {');
      console.log('        "figma-console": {');
      console.log('          "command": "node",');
      console.log(`          "args": [${e}]`);
      console.log('        }');
      console.log('      }');
      console.log('    }');
      break;
    }
    case 'cline': {
      console.log('  Config file (VS Code): see Cline extension → MCP Servers → Edit.');
      console.log('  Add server:');
      console.log('');
      console.log('    {');
      console.log('      "figma-console": {');
      console.log('        "command": "node",');
      console.log(`        "args": [${e}],`);
      console.log('        "disabled": false');
      console.log('      }');
      console.log('    }');
      break;
    }
    default: {
      console.log(`  (no preset snippet for "${agent}"; use node ${entry})`);
    }
  }
}

function printBridgeInstructions(bridgeDir) {
  const line = '─'.repeat(72);
  console.log('');
  console.log(line);
  console.log('  One-time: import the Figma Desktop bridge plugin');
  console.log(line);
  console.log('');
  console.log('  1. Open Figma Desktop → Menu → Plugins → Development');
  console.log('     → Import plugin from manifest…');
  console.log(`  2. Choose: ${join(bridgeDir, 'manifest.json')}`);
  console.log('  3. Run the plugin inside the file you want the AI to edit.');
  console.log('  4. Keep the plugin window open while the AI is working.');
  console.log('');
  console.log('  Details: https://github.com/southleft/figma-console-mcp');
}

// --- Helpers ------------------------------------------------------------

function cpSyncAll(src, dst) {
  cpSync(src, dst, { recursive: true });
}
