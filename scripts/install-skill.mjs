#!/usr/bin/env node
/**
 * install-skill — copy packages/skill/* into the target AI agent's skill
 * directory, as declared in packages/skill/manifest.json → installTargets.
 *
 * Usage:
 *   node scripts/install-skill.mjs                 # default: codex
 *   node scripts/install-skill.mjs --agent claude
 *   node scripts/install-skill.mjs --agent cursor
 *   node scripts/install-skill.mjs --agent cline
 *   node scripts/install-skill.mjs --dry-run       # just print what would happen
 */

import { readFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SKILL_DIR = resolve(REPO_ROOT, 'packages/skill');

const args = process.argv.slice(2);
const agent = pickArg('--agent', 'codex');
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

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

const manifest = JSON.parse(
  readFileSync(join(SKILL_DIR, 'manifest.json'), 'utf8')
);

const target = manifest.installTargets?.[agent];
if (!target) {
  console.error(
    `[install-skill] unknown agent "${agent}". Available: ${Object.keys(
      manifest.installTargets || {}
    ).join(', ')}`
  );
  process.exit(1);
}

const osKey = platform() === 'win32' ? 'windows' : 'unix';
const targetPath = expandHome(target[osKey] ?? target.unix);

console.log(`[install-skill] skill: ${manifest.name}@${manifest.version}`);
console.log(`[install-skill] agent: ${agent} (${osKey})`);
console.log(`[install-skill] source: ${SKILL_DIR}`);
console.log(`[install-skill] target: ${targetPath}`);

if (dryRun) {
  console.log('[install-skill] dry-run; no files copied.');
  process.exit(0);
}

if (existsSync(targetPath)) {
  if (!force) {
    console.error(
      `[install-skill] target already exists: ${targetPath}\n` +
        `[install-skill] pass --force to overwrite.`
    );
    process.exit(2);
  }
  rmSync(targetPath, { recursive: true, force: true });
  console.log(`[install-skill] removed existing target.`);
}

mkdirSync(dirname(targetPath), { recursive: true });
cpSync(SKILL_DIR, targetPath, {
  recursive: true,
  filter: (src) => !src.includes('node_modules') && !src.endsWith('package.json')
});

console.log(`[install-skill] ✅ installed to ${targetPath}`);
console.log(`[install-skill] next: open your agent and pick up the skill.`);
