#!/usr/bin/env node
/**
 * test-parse — one-shot smoke test.
 *
 * Reads a v2 Markdown file, runs parseV2, prints IR summary.
 *
 * Usage:
 *   node scripts/test-parse.mjs                              # default: examples/玩家等级系统/*.md
 *   node scripts/test-parse.mjs path/to/your/doc.md
 *
 * Requires: `npm run build --prefix packages/figma-mcp-server` first.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const mdArg = process.argv[2];
const mdPath = mdArg
  ? resolve(process.cwd(), mdArg)
  : resolve(REPO_ROOT, 'examples/玩家等级系统/玩家等级系统_交互文档.md');

if (!existsSync(mdPath)) {
  console.error(`[test-parse] markdown not found: ${mdPath}`);
  process.exit(1);
}

const enginePath = resolve(
  REPO_ROOT,
  'packages/figma-mcp-server/dist/v2/parser.js'
);
if (!existsSync(enginePath)) {
  console.error(
    `[test-parse] engine dist not built. Run:\n  npm run build --prefix packages/figma-mcp-server`
  );
  process.exit(1);
}

const { parseV2 } = await import(pathToFileURL(enginePath).href);

const md = readFileSync(mdPath, 'utf8');
const result = parseV2(md);

console.log('--- PARSE RESULT ---');
console.log('file:', mdPath);
console.log('ok:', result.ok);
console.log('errors:', result.errors.length);
for (const e of result.errors) console.log('  -', e.code, e.message);
console.log('warnings:', result.warnings.length);
for (const w of result.warnings) console.log('  -', w.code, w.message);

if (!result.ir) process.exit(result.ok ? 0 : 1);

const ir = result.ir;
console.log('\n--- IR ---');
console.log('header:', ir.header);
console.log(
  'overview.background.len =',
  ir.overview.background.length,
  ', overview.coreInteraction.len =',
  ir.overview.coreInteraction.length
);
console.log('\nsections:');
for (const s of ir.sections) {
  console.log(
    `  [${s.index}] "${s.name}"  clusters=${s.clusters.length}  isGlobalSpec=${s.isGlobalSpec}`
  );
  for (const c of s.clusters) {
    const hasImg = c.bullets.some((b) =>
      /(^|\s|^[-·•*]+\s*)配图\s*[：:]/.test(b)
    );
    console.log(
      `     #${c.order}  "${c.title}"  roles=[${c.roles.join(',')}]  bullets=${c.bullets.length}  hasImg=${hasImg}`
    );
  }
}

process.exit(result.ok ? 0 : 1);
