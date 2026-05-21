// One-shot smoke test: parse 玩家等级系统 v2 markdown, print IR summary.
import { readFileSync } from 'node:fs';
import { parseV2 } from '../dist/v2/parser.js';

const MD_PATH =
  'H:\\kk8项目文件\\局内交互\\interaction-projects\\玩家等级系统\\02-design\\玩家等级系统_交互文档.md';

const md = readFileSync(MD_PATH, 'utf8');
const result = parseV2(md);

console.log('--- PARSE RESULT ---');
console.log('ok:', result.ok);
console.log('errors:', JSON.stringify(result.errors, null, 2));
console.log('warnings:', JSON.stringify(result.warnings, null, 2));
if (!result.ir) {
  process.exit(result.ok ? 0 : 1);
}

const ir = result.ir;
console.log('\n--- IR STRUCTURE ---');
console.log('header:', ir.header);
console.log('overview.background (len):', ir.overview.background.length);
console.log('overview.coreInteraction (len):', ir.overview.coreInteraction.length);
console.log('\nsections:');
for (const s of ir.sections) {
  console.log(
    `  [${s.index}] "${s.name}"  clusters=${s.clusters.length}  isGlobalSpec=${s.isGlobalSpec}`
  );
  for (const c of s.clusters) {
    const imgHit = c.bullets.some((b) => /(^|\s|^[-·•*]+\s*)配图\s*[：:]/.test(b));
    console.log(
      `     #${c.order}  "${c.title}"  roles=[${c.roles.join(',')}]  bullets=${c.bullets.length}  hasImg=${imgHit}`
    );
  }
}
