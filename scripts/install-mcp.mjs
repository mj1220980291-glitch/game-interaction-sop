#!/usr/bin/env node
/**
 * install-mcp — unpack the bundled figma-console-mcp tarball into a
 * stable local directory (this is where the Figma Desktop Bridge plugin
 * manifest lives) and print the MCP config snippet the user must paste
 * into their AI agent's config file.
 *
 * IMPORTANT: the snippet registers `figma-interaction-doc-engine`, NOT
 * `figma-console`. The engine spawns its own figma-console-mcp child; a
 * second standalone instance would fight it for the bridge WebSocket
 * port. The unpacked tarball here is used only for the bridge plugin
 * manifest that you import into Figma Desktop.
 *
 * Why not auto-edit the agent's config?
 *   Each agent uses a different config format (TOML for Codex, JSON for
 *   Claude/Cursor/Cline, a GUI form for CodeMaker). Surgically editing
 *   these without clobbering the user's other MCP servers is fragile. We
 *   print a clean, copy-pasteable snippet instead.
 *
 * Usage:
 *   node scripts/install-mcp.mjs                    # default: prints all agents
 *   node scripts/install-mcp.mjs --agent codemaker  # print only codemaker snippet
 *   node scripts/install-mcp.mjs --agent codex
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

const bridgeAbs = join(installDir, mcp.bridgeDir);
const engineEntryAbs = resolve(
  REPO_ROOT,
  'packages/figma-mcp-server/dist/server/index.js'
);

// --- Print agent config snippets ----------------------------------------

printBanner();

const agents = agentFilter
  ? [agentFilter]
  : ['codemaker', 'codex', 'claude', 'cursor', 'cline'];

for (const agent of agents) {
  printSnippet(agent, engineEntryAbs);
}

printBridgeInstructions(bridgeAbs);

// --- Snippet printers ---------------------------------------------------

function printBanner() {
  const line = '─'.repeat(72);
  console.log('');
  console.log(line);
  console.log('  Register ONE MCP server: figma-interaction-doc-engine.');
  console.log('  Do NOT also register a standalone figma-console server —');
  console.log('  the engine spawns its own child and the two would fight');
  console.log('  over the Figma Desktop Bridge WebSocket port.');
  console.log('  After pasting, restart the agent so it picks up the server.');
  console.log(line);

  if (!existsSync(engineEntryAbs)) {
    console.log('');
    console.log(
      `  ⚠ engine not built yet: ${engineEntryAbs}\n` +
        '    run: npm run build --prefix packages/figma-mcp-server'
    );
  }
}

function printSnippet(agent, entry) {
  const e = JSON.stringify(entry);
  console.log('');
  console.log(`━━━ ${agent} ━━━`);
  switch (agent) {
    case 'codemaker': {
      console.log('  Settings → MCP Servers → add a custom stdio service:');
      console.log('');
      console.log('    Name    : figma-interaction-doc-engine');
      console.log('    Type    : stdio');
      console.log('    Command : node');
      console.log(`    Args    : ${entry}`);
      console.log('    Env     : FIGMA_BACKEND=figma-console');
      console.log('              FIGMA_ACCESS_TOKEN=<your figd_ token>');
      console.log('    Timeout : 120');
      break;
    }
    case 'codex': {
      console.log('  Config file: ~/.codex/config.toml');
      console.log('  Append:');
      console.log('');
      console.log('    [mcp_servers.figma-interaction-doc-engine]');
      console.log(`    command = "node"`);
      console.log(`    args    = [${e}]`);
      console.log('    env     = { FIGMA_BACKEND = "figma-console", FIGMA_ACCESS_TOKEN = "<your figd_ token>" }');
      break;
    }
    case 'claude': {
      console.log('  Config file:');
      console.log('    macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json');
      console.log('    Windows: %APPDATA%\\Claude\\claude_desktop_config.json');
      printJsonSnippet(e, 6);
      break;
    }
    case 'cursor': {
      console.log('  Config file: ~/.cursor/mcp.json');
      printJsonSnippet(e, 6);
      break;
    }
    case 'cline': {
      console.log('  Config file (VS Code): see Cline extension → MCP Servers → Edit.');
      printJsonSnippet(e, 6, true);
      break;
    }
    default: {
      console.log(`  (no preset snippet for "${agent}"; use node ${entry})`);
    }
  }
}

function printJsonSnippet(entryJson, indent, withDisabled = false) {
  const p = ' '.repeat(indent);
  console.log('  Merge into "mcpServers":');
  console.log('');
  console.log(`${p}{`);
  console.log(`${p}  "mcpServers": {`);
  console.log(`${p}    "figma-interaction-doc-engine": {`);
  console.log(`${p}      "command": "node",`);
  console.log(`${p}      "args": [${entryJson}],`);
  console.log(`${p}      "env": {`);
  console.log(`${p}        "FIGMA_BACKEND": "figma-console",`);
  console.log(`${p}        "FIGMA_ACCESS_TOKEN": "<your figd_ token>"`);
  console.log(`${p}      }${withDisabled ? ',' : ''}`);
  if (withDisabled) {
    console.log(`${p}      "disabled": false`);
  }
  console.log(`${p}    }`);
  console.log(`${p}  }`);
  console.log(`${p}}`);
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
