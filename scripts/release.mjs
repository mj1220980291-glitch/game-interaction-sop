#!/usr/bin/env node
/**
 * release — produce a shippable .zip of the whole SOP distribution.
 *
 * Output:
 *   release/game-interaction-sop-<version>.zip
 *
 * What's inside:
 *   - packages/** (source + docs, NO dist, NO node_modules)
 *   - scripts/**
 *   - vendor/**  (includes the figma-console-mcp tarball)
 *   - examples/**
 *   - README.md, SETUP.md, package.json, package-lock.json, .gitignore
 *
 * What's skipped:
 *   - node_modules, dist, coverage
 *   - .git, .DS_Store, *.log, .vscode, .idea
 *   - release/ itself (recursive zip trap)
 *
 * Usage:
 *   node scripts/release.mjs
 *   node scripts/release.mjs --tag rc1            # appends -rc1 to filename
 *   node scripts/release.mjs --no-clean           # keep the staging dir for inspection
 */

import {
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  statSync,
  renameSync,
  createReadStream,
  readdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const tag = pickArg('--tag', null);
const keepStaging = args.includes('--no-clean');

function pickArg(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

// --- Read version ------------------------------------------------------

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const baseName = `${pkg.name.replace('-monorepo', '')}-${version}${tag ? `-${tag}` : ''}`;

const RELEASE_DIR = resolve(REPO_ROOT, 'release');
// Stage OUTSIDE the repo so cpSync doesn't trip over "can't copy dir into
// its own subdirectory" even though our filter would skip the release/
// path. Staging goes to os.tmpdir()/<baseName>-<pid>/ and is deleted at
// the end (or kept with --no-clean).
const STAGING_PARENT = join(tmpdir(), `sop-release-${process.pid}`);
const STAGING_DIR = join(STAGING_PARENT, baseName);
const ZIP_PATH = join(RELEASE_DIR, `${baseName}.zip`);

console.log(`[release] name:    ${baseName}`);
console.log(`[release] staging: ${STAGING_DIR}`);
console.log(`[release] zip:     ${ZIP_PATH}`);

// --- Prepare output ----------------------------------------------------

if (!existsSync(RELEASE_DIR)) mkdirSync(RELEASE_DIR, { recursive: true });
if (existsSync(STAGING_DIR)) rmSync(STAGING_DIR, { recursive: true, force: true });
if (existsSync(ZIP_PATH)) rmSync(ZIP_PATH, { force: true });

// --- Exclusion rules ---------------------------------------------------

/** Segments that, if present anywhere in the relative path, cause skip. */
const SKIP_DIRNAMES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.vscode',
  '.idea',
  'release'
]);

/** Suffixes that cause file-level skip. */
const SKIP_SUFFIXES = ['.log', '.DS_Store'];

function shouldSkip(srcAbs) {
  const rel = relative(REPO_ROOT, srcAbs);
  if (!rel || rel.startsWith('..')) return false; // keep repo root itself
  const parts = rel.split(sep);
  for (const part of parts) {
    if (SKIP_DIRNAMES.has(part)) return true;
    if (SKIP_SUFFIXES.some((s) => part.endsWith(s))) return true;
  }
  return false;
}

// --- Stage (copy whole repo minus excludes) ----------------------------

console.log('[release] staging files ...');
cpSync(REPO_ROOT, STAGING_DIR, {
  recursive: true,
  filter: (src) => !shouldSkip(src)
});

// Sanity-check: staging must NOT contain node_modules or dist anywhere.
assertCleanStaging(STAGING_DIR);

// --- Zip via PowerShell ------------------------------------------------

console.log('[release] compressing ...');
// Compress-Archive takes forward- or back-slashes; we pass absolute paths.
const ps = [
  `$ErrorActionPreference='Stop';`,
  `Compress-Archive -Path '${STAGING_DIR}' -DestinationPath '${ZIP_PATH}' -Force`
].join(' ');
execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, {
  stdio: 'inherit'
});

// --- Report ------------------------------------------------------------

const sizeBytes = statSync(ZIP_PATH).size;
const sha256 = await hashFile(ZIP_PATH);

console.log('');
console.log('────────────────────────────────────────────────────────────────────────');
console.log(`  ✅ Built ${baseName}.zip`);
console.log('────────────────────────────────────────────────────────────────────────');
console.log(`  Path:   ${ZIP_PATH}`);
console.log(`  Size:   ${humanSize(sizeBytes)} (${sizeBytes.toLocaleString()} bytes)`);
console.log(`  SHA256: ${sha256}`);
console.log('');
console.log('  Staging contents preserved?: ' + (keepStaging ? `yes → ${STAGING_DIR}` : 'no (deleted)'));

if (!keepStaging) {
  rmSync(STAGING_PARENT, { recursive: true, force: true });
}

console.log('');
console.log('  Send this single file to recipients. They should:');
console.log('    1. Unzip');
console.log('    2. Follow SETUP.md (5 steps)');

// --- Helpers -----------------------------------------------------------

function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(2)} ${units[i]}`;
}

function hashFile(path) {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    const s = createReadStream(path);
    s.on('data', (c) => h.update(c));
    s.on('end', () => res(h.digest('hex')));
    s.on('error', rej);
  });
}

function assertCleanStaging(dir) {
  const bad = [];
  walk(dir, (p) => {
    const rel = relative(dir, p);
    const parts = rel.split(sep);
    for (const part of parts) {
      if (SKIP_DIRNAMES.has(part)) bad.push(rel);
    }
  });
  if (bad.length > 0) {
    console.error('[release] staging contains forbidden paths:');
    for (const b of bad.slice(0, 10)) console.error('  - ' + b);
    if (bad.length > 10) console.error(`  ... and ${bad.length - 10} more`);
    process.exit(4);
  }
}

function walk(dir, cb) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    cb(p);
    if (entry.isDirectory()) walk(p, cb);
  }
}
