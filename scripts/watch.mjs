#!/usr/bin/env node
/**
 * watch — dev-mode file watcher (Node.js ≥ 20 built-ins only, no extra deps).
 *
 * Watches two source trees and auto-deploys on change:
 *
 *   packages/skill/**                   → install-skill --agent <agent> --force
 *   packages/figma-mcp-server/src/**    → npm run build  (then prompts to restart MCP)
 *
 * Usage:
 *   node scripts/watch.mjs                   # default agent: codemaker
 *   node scripts/watch.mjs --agent claude
 *   node scripts/watch.mjs --agent cursor
 */

import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// --- CLI args ---

const args = process.argv.slice(2);
function pickArg(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const agent = pickArg('--agent', 'codemaker');

// --- Config ---

const DEBOUNCE_MS = 500; // ms to wait after last file event before acting

// --- Helpers ---

function ts() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function run(label, cmd, cmdArgs, cwd = REPO_ROOT) {
  return new Promise((resolve) => {
    console.log(`\n[${ts()}] 🔄  ${label} ...`);
    const child = spawn(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: true });
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[${ts()}] ✅  ${label}`);
      } else {
        console.error(`[${ts()}] ❌  ${label}  (exit ${code})`);
      }
      resolve(code);
    });
  });
}

/**
 * Returns a debounced wrapper around `fn`.
 * If a new call arrives while `fn` is still running, one extra run is queued.
 */
function debounce(fn, ms) {
  let timer = null;
  let running = false;
  let pending = false;

  async function exec() {
    running = true;
    try { await fn(); } finally { running = false; }
    if (pending) { pending = false; exec(); }
  }

  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (running) { pending = true; return; }
      exec();
    }, ms);
  };
}

// --- Actions ---

const syncSkill = debounce(async () => {
  await run(
    `skill → ~/.codemaker/skills/ (agent: ${agent})`,
    'node',
    ['scripts/install-skill.mjs', '--agent', agent, '--force'],
    REPO_ROOT
  );
}, DEBOUNCE_MS);

const buildEngine = debounce(async () => {
  const code = await run(
    'engine tsc build',
    'npm',
    ['run', 'build', '--prefix', 'packages/figma-mcp-server'],
    REPO_ROOT
  );
  if (code === 0) {
    console.log(`\n  ⚠️  引擎已重新编译。请在 CodeMaker 里重启 figma-interaction-doc-engine MCP Server 才能生效。`);
    console.log(`     CodeMaker → 扳手图标 → MCP Servers → figma-interaction-doc-engine → 禁用再启用\n`);
  }
}, DEBOUNCE_MS);

// --- Watch ---

const skillDir    = resolve(REPO_ROOT, 'packages/skill');
const engineSrcDir = resolve(REPO_ROOT, 'packages/figma-mcp-server/src');

watch(skillDir, { recursive: true }, (event, filename) => {
  if (!filename) return;
  const rel = relative(REPO_ROOT, resolve(skillDir, filename));
  console.log(`  [skill]  ${event}: ${rel}`);
  syncSkill();
});

watch(engineSrcDir, { recursive: true }, (event, filename) => {
  if (!filename) return;
  const rel = relative(REPO_ROOT, resolve(engineSrcDir, filename));
  console.log(`  [engine] ${event}: ${rel}`);
  buildEngine();
});

// --- Banner ---

console.log('');
console.log('👀  watch mode — 监听文件变化，自动同步到运行时');
console.log('');
console.log(`  packages/skill/**                  → install-skill --agent ${agent} --force`);
console.log(`  packages/figma-mcp-server/src/**   → npm run build`);
console.log('');
console.log('  Ctrl+C 退出');
console.log('');
