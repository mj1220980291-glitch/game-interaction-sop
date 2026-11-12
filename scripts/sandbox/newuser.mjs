#!/usr/bin/env node
/**
 * 新用户沙盒 —— 从零模拟「拿到仓库 → 装起来 → 引擎可用」的可重复验证。
 *
 * 为什么需要它：推广到别的团队，唯一的真验收是「没用过的人照着仓库能走通」。
 * 过去靠人记、靠临时手测，改完代码无法回答「这次会不会让新用户装不上」。
 *
 * 用法：
 *   node scripts/sandbox/newuser.mjs                        # 默认：当前工作区 + 正常 PATH
 *   node scripts/sandbox/newuser.mjs --source git --url <url>
 *   node scripts/sandbox/newuser.mjs --path-mode no-node
 *   node scripts/sandbox/newuser.mjs --keep                 # 保留沙盒，不重建
 *   node scripts/sandbox/newuser.mjs --only build,engine-boot
 *
 * 产物：docs/pilot/reports/<时间>.json / .md
 *
 * Spec: openspec/changes/add-newuser-sandbox
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, cpSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

// --- args ------------------------------------------------------------------

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const ROOT = resolve(arg('root', join(tmpdir(), 'gisop-newuser')));
const SOURCE = arg('source', 'worktree');
const URL = arg('url', 'https://github.com/mj1220980291-glitch/game-interaction-sop.git');
const PATH_MODE = arg('path-mode', 'normal');
const KEEP = flag('keep') || argv.includes('--no-reset');
const WITH_FIGMA = flag('with-figma');
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SANDBOX_REPO = join(ROOT, 'repo');
const SANDBOX_HOME = join(ROOT, 'home');
const SANDBOX_TMP = join(ROOT, 'tmp');
const SANDBOX_CACHE = join(ROOT, 'npm-cache');
const REPORT_DIR = join(REPO, 'docs', 'pilot', 'reports');

// --- helpers ---------------------------------------------------------------

const steps = [];

function isoStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sandboxEnv(extra = {}) {
  const base = {
    ...process.env,
    USERPROFILE: SANDBOX_HOME,
    HOME: SANDBOX_HOME,
    TEMP: SANDBOX_TMP,
    TMP: SANDBOX_TMP,
    npm_config_cache: SANDBOX_CACHE,
    // 关掉 npm 的进度条噪音，报告里只留结论
    npm_config_loglevel: 'error',
    ...extra
  };
  if (PATH_MODE === 'no-node') {
    base.PATH = 'C:\\windows\\system32;C:\\windows';
  }
  return base;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? SANDBOX_REPO,
      env: opts.env ?? sandboxEnv(),
      shell: opts.shell === true,
      windowsHide: true
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }, opts.timeoutMs ?? 15 * 60_000);
    child.stdout?.on('data', (b) => {
      out += b.toString();
      if (out.length > 200_000) out = out.slice(-200_000);
    });
    child.stderr?.on('data', (b) => {
      err += b.toString();
      if (err.length > 200_000) err = err.slice(-200_000);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? -1, out, err });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolvePromise({ code: -1, out, err: err + String(e?.message ?? e) });
    });
  });
}

const nodeBin = process.execPath;
const nodeDir = dirname(nodeBin);
/**
 * 不要直接 spawn `npm.cmd`：Windows 上 Node 20+ 会抛 `spawn EINVAL`。
 * 用 `node <npm-cli.js>` 的绝对路径调用，同时也正好复刻文档要求的「全部走绝对路径」。
 */
const npmCli = join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmCmd = join(nodeDir, process.platform === 'win32' ? 'npm.cmd' : 'npm');

/** 跑 npm（绝对路径，不依赖 PATH）。 */
function runNpm(args, opts = {}) {
  return run(nodeBin, [npmCli, ...args], opts);
}

function firstErrorLine(text) {
  const line = (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^npm warn/i.test(l));
  return line ? line.slice(0, 300) : '';
}

async function step(id, title, fn) {
  if (ONLY.length > 0 && !ONLY.includes(id)) {
    steps.push({ id, title, status: 'skipped', durationMs: 0, firstError: '', assertions: [], detail: 'filtered by --only' });
    return;
  }
  process.stderr.write(`\n▶ ${id} — ${title}\n`);
  const started = Date.now();
  const assertions = [];
  const check = (name, ok, detail) => {
    assertions.push({ name, ok: Boolean(ok), ...(detail ? { detail: String(detail).slice(0, 300) } : {}) });
    return Boolean(ok);
  };
  let status = 'pass';
  let firstError = '';
  let detail = '';
  try {
    const res = await fn({ check });
    if (res?.status) status = res.status;
    if (res?.detail) detail = res.detail;
    if (assertions.some((a) => !a.ok)) status = status === 'skipped' ? 'skipped' : 'fail';
    firstError = assertions.find((a) => !a.ok)?.detail ?? '';
  } catch (e) {
    status = 'fail';
    detail = String(e?.message ?? e).slice(0, 400);
    firstError = detail;
  }
  const durationMs = Date.now() - started;
  steps.push({ id, title, status, durationMs, firstError, assertions, detail });
  process.stderr.write(`  → ${status} (${durationMs}ms)\n`);
}

// --- prepare ---------------------------------------------------------------

function prepareSandbox() {
  if (existsSync(ROOT) && !KEEP) {
    rmSync(ROOT, { recursive: true, force: true });
  }
  // `--keep` 只复用**代码**（省一次 git ls-files 复制），用户目录 / 临时目录 / npm cache
  // 每次都要重建：它们代表「新机器上什么都没有」，留着上一次的 lock 文件就不再是新机器了
  // （2026-11-12 实测：keep 模式下 env 断言直接红）
  for (const dir of [SANDBOX_HOME, SANDBOX_TMP, SANDBOX_CACHE]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(SANDBOX_REPO)) {
    if (SOURCE === 'git') {
      // 模拟真实用户「拉到仓库」
      return run('git', ['clone', '--depth', '1', URL, SANDBOX_REPO], {
        cwd: ROOT,
        env: sandboxEnv(),
        timeoutMs: 10 * 60_000
      });
    }
    // 模拟「我改完还没推」：只复制 **git 跟踪的文件**（含未提交修改）。
    // 用 cpSync 整目录会把 `.interaction-sop/` 这类 gitignore 的本地草稿也带进去，
    // 新用户机器上根本不会有——沙盒就失真了（2026-11-12 实测：命中了宿主的 template.json）。
    const listed = runSync('git', ['ls-files', '-z'], REPO);
    if (listed.code !== 0 || !listed.out) {
      throw new Error(`git ls-files 失败，无法确定「新用户会拿到哪些文件」：${firstErrorLine(listed.err)}`);
    }
    const files = listed.out.split('\u0000').filter(Boolean);
    for (const rel of files) {
      const from = join(REPO, rel);
      const to = join(SANDBOX_REPO, rel);
      if (!existsSync(from)) continue; // 已删除但还没提交
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    }
    return { code: 0, out: `${files.length} files`, err: '' };
  }
  return Promise.resolve({ code: 0, out: '', err: '' });
}

/** 同步版：只在建沙盒时用（需要立刻拿到文件清单）。 */
function runSync(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return {
    code: r.status ?? -1,
    out: r.stdout ? r.stdout.toString('utf8') : '',
    err: r.stderr ? r.stderr.toString('utf8') : ''
  };
}

// --- MCP client (引擎起来后直接对话) ---------------------------------------

async function withEngine(fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const transport = new StdioClientTransport({
    command: nodeBin,
    args: [join(SANDBOX_REPO, 'packages', 'figma-mcp-server', 'dist', 'server', 'index.js')],
    env: sandboxEnv(),
    // 必须显式指定 cwd：否则引擎继承「运行脚本的目录」，模板包会命中宿主仓库的
    // `.interaction-sop/template.json`，整个沙盒就白做了（2026-11-12 首次全量跑实测）
    cwd: SANDBOX_REPO,
    stderr: 'pipe'
  });
  let stderr = '';
  transport.stderr?.on('data', (b) => {
    stderr += b.toString();
  });

  const client = new Client({ name: 'newuser-sandbox', version: '0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await fn(client, () => stderr);
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
}

const toolText = (r) => (r?.content ?? []).map((c) => c.text ?? '').join('\n');

// --- journey ---------------------------------------------------------------

await prepareSandbox();

const pathModeNote =
  PATH_MODE === 'no-node' ? 'PATH 已剔除 node（模拟别人的机器）' : '正常 PATH';
process.stderr.write(`\n沙盒根：${ROOT}\nsource=${SOURCE}  ${pathModeNote}\n`);

await step('env', '环境自检：新机器该有什么', async ({ check }) => {
  const v = await run(nodeBin, ['-v'], { cwd: ROOT, timeoutMs: 30_000 });
  check('node 绝对路径可用', v.code === 0, `${nodeBin} → ${v.out || v.err}`);

  const homeEmpty = !existsSync(join(SANDBOX_HOME, '.game-interaction-sop'));
  check('用户目录无历史配置', homeEmpty, join(SANDBOX_HOME, '.game-interaction-sop'));

  if (PATH_MODE === 'no-node') {
    const bare = await run('node', ['-v'], { cwd: ROOT, env: sandboxEnv(), timeoutMs: 30_000 });
    check('PATH 里没有 node 时直接调用失败（复现 spawn ENOENT 现场）', bare.code !== 0, firstErrorLine(bare.err));
    const npmBare = await run(npmCmd, ['-v'], { cwd: ROOT, env: sandboxEnv(), timeoutMs: 60_000, shell: true });
    check('PATH 里没有 node 时 npm.cmd 也跑不起来（文档据此要求绝对路径）', npmBare.code !== 0, firstErrorLine(npmBare.err));
    const withPath = await runNpm(['-v'], {
      cwd: ROOT,
      env: sandboxEnv(),
      timeoutMs: 60_000
    });
    check('用 node 绝对路径调 npm 能恢复（不依赖 PATH）', withPath.code === 0, withPath.out.trim());
    return { status: 'pass', detail: 'no-node 模式只验文档承诺的三句话，不跑安装' };
  }

  const top = existsSync(SANDBOX_REPO) ? readdirSync(SANDBOX_REPO).filter((f) => !f.startsWith('.')) : [];
  check('仓库根有 README.md', top.includes('README.md'));
  check('仓库根有 SETUP.md', top.includes('SETUP.md'));
  check('仓库根有 docs/', top.includes('docs'));
  check('仓库根有 packages/', top.includes('packages'));
  return { detail: `根目录：${top.join(' / ')}` };
});

if (PATH_MODE !== 'no-node') {
  await step('install', '装依赖（npm install）', async ({ check }) => {
    const r = await runNpm(['install', '--no-audit', '--no-fund'], { timeoutMs: 15 * 60_000 });
    check('npm install 成功', r.code === 0, firstErrorLine(r.err) || firstErrorLine(r.out));
    return { detail: r.code === 0 ? '' : (r.err || r.out).slice(-1200) };
  });

  await step('build', '编译引擎（npm run build）', async ({ check }) => {
    const r = await runNpm(['run', 'build'], { timeoutMs: 10 * 60_000 });
    check('npm run build 成功', r.code === 0, firstErrorLine(r.err) || firstErrorLine(r.out));
    const entry = join(SANDBOX_REPO, 'packages', 'figma-mcp-server', 'dist', 'server', 'index.js');
    check('dist/server/index.js 存在', existsSync(entry), entry);
    return { detail: r.code === 0 ? '' : (r.err || r.out).slice(-1200) };
  });

  await step('install-mcp', '生成 MCP 配置片段', async ({ check }) => {
    const r = await run(nodeBin, ['scripts/install-mcp.mjs', '--agent', 'codemaker'], {
      timeoutMs: 5 * 60_000
    });
    const out = r.out ?? '';
    check('脚本退出码 0', r.code === 0, firstErrorLine(r.err));
    check('片段里的 command 是 node 绝对路径', out.includes(nodeDir.replace(/\\/g, '\\\\')) || out.includes(nodeBin), '');
    check('片段里没有裸 "command": "node"', !/"command":\s*"node"/.test(out));
    check('片段指向沙盒里的 dist 入口', out.includes('dist') && out.includes('index.js'));
    return { detail: r.code === 0 ? '' : (r.err || out).slice(-1200) };
  });

  await step('engine-boot', '宿主拉起引擎（MCP 握手 + 工具清单）', async ({ check }) => {
    return withEngine(async (client, getStderr) => {
      const list = await client.listTools();
      const names = list.tools.map((t) => t.name);
      check('引擎能握手（tools/list 有返回）', names.length > 0, `共 ${names.length} 个工具`);
      check('原生工具 validate_v2_markdown', names.includes('validate_v2_markdown'));
      check('原生工具 render_v2_markdown_to_figma', names.includes('render_v2_markdown_to_figma'));
      check('原生工具 figma_compile_template', names.includes('figma_compile_template'));
      check('原生工具 audit_template_pack', names.includes('audit_template_pack'));
      return { detail: getStderr().slice(-600) };
    });
  });

  await step('pack-resolution', '空用户目录下命中仓库自带基线包', async ({ check }) => {
    return withEngine(async (client) => {
      const res = await client.callTool(
        { name: 'audit_template_pack', arguments: { deep: false } },
        undefined,
        { timeout: 120_000 }
      );
      const text = toolText(res);
      check('不传 path 也能定位到包（说明基线包随仓库分发）', text.includes('"ok": true'), text.slice(0, 400));
      check(
        '命中的是引擎包内基线（bundled），没有借用宿主仓库的本地配置',
        /"origin":\s*"bundled/.test(text),
        (/"origin":\s*"[^"]+"/.exec(text) ?? [''])[0]
      );
      const egg = await client.callTool(
        {
          name: 'audit_template_pack',
          arguments: {
            path: join(SANDBOX_REPO, 'packages', 'figma-mcp-server', 'assets', 'packs', '蛋仔派对.json'),
            deep: false
          }
        },
        undefined,
        { timeout: 120_000 }
      );
      const eggText = toolText(egg);
      check('蛋仔基线包可被解析且体检通过', eggText.includes('"findings": []'), eggText.slice(0, 400));
      return { detail: text.slice(0, 600) };
    });
  });

  await step('contract', '书写契约能从包重建（丢了也不怕）', async ({ check }) => {
    return withEngine(async (client) => {
      const res = await client.callTool(
        { name: 'figma_compile_template', arguments: { phase: 'contract', project: '蛋仔派对' } },
        undefined,
        { timeout: 120_000 }
      );
      const text = toolText(res);
      check('phase=contract 有返回正文', text.includes('mdContract') || text.includes('书写契约'), text.slice(0, 300));
      check('契约里写明需求组可省略', text.includes('可省略') || text.includes('需求组'));
      return { detail: text.slice(0, 500) };
    });
  });

  await step('guidance', '新用户第一眼看到的信息是准的', async ({ check }) => {
    const readme = readFileSync(join(SANDBOX_REPO, 'README.md'), 'utf-8');
    const onboarding = readFileSync(join(SANDBOX_REPO, 'docs', 'onboarding.md'), 'utf-8');
    check('README 提到仓库自带基线包（零配置可渲染）', /基线包|assets\/packs|零配置/.test(readme));
    check('README 提到 install-mcp 生成配置片段', /install-mcp/.test(readme));
    check('onboarding 有「拿到的是什么」这一步', /拿到什么|第 0 步|第一步|你会得到/.test(onboarding));
    check('onboarding 写明零配置可渲染', /零配置|自带的?基线包|不用配模板/.test(onboarding));
    return {};
  });

  if (WITH_FIGMA) {
    await step('render', '真机渲染（--with-figma）', async ({ check }) => {
      return withEngine(async (client) => {
        const md = readFileSync(
          join(SANDBOX_REPO, 'packages', 'figma-mcp-server', 'tests', 'v2', 'fixtures', 'buzhong.md'),
          'utf-8'
        );
        const res = await client.callTool(
          {
            name: 'render_v2_markdown_to_figma',
            arguments: { markdown: md, target: { fileKey: arg('figma-file', '') }, assetMap: {} }
          },
          undefined,
          { timeout: 240_000 }
        );
        const text = toolText(res);
        check('渲染返回 ok:true', text.includes('"ok": true'), text.slice(0, 400));
        return { detail: text.slice(0, 600) };
      });
    });
  }
}

// --- report ----------------------------------------------------------------

const stamp = isoStamp();
mkdirSync(REPORT_DIR, { recursive: true });

const summary = {
  when: new Date().toISOString(),
  root: ROOT,
  source: SOURCE,
  pathMode: PATH_MODE,
  node: process.version,
  steps
};

const jsonPath = join(REPORT_DIR, `${stamp}.json`);
writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

const icon = (s) => (s === 'pass' ? '✅' : s === 'fail' ? '❌' : '⏭️');
const md = [
  `# 新用户沙盒报告 ${stamp}`,
  '',
  `- 沙盒根：\`${ROOT}\``,
  `- 代码来源：\`${SOURCE}\`${SOURCE === 'git' ? `（${URL}）` : '（当前工作区）'}`,
  `- PATH 模式：\`${PATH_MODE}\``,
  `- Node：\`${process.version}\``,
  '',
  '| 步 | 结果 | 耗时 | 首个错误 |',
  '|---|---|---|---|'
]
  .concat(
    steps.map(
      (s) =>
        `| ${s.id} | ${icon(s.status)} ${s.status} | ${(s.durationMs / 1000).toFixed(1)}s | ${
          s.firstError ? s.firstError.replace(/\|/g, '\\|') : '—'
        } |`
    )
  )
  .concat(['', '## 断言明细', ''])
  .concat(
    steps.flatMap((s) => [
      `### ${s.id} — ${s.title}`,
      ...(s.assertions.length === 0 ? [s.detail ? `- ${s.detail}` : '- （无断言）'] : []),
      ...s.assertions.map((a) => `- ${a.ok ? '✅' : '❌'} ${a.name}${a.detail ? ` — \`${a.detail}\`` : ''}`),
      ...(s.detail ? ['', '```', s.detail.slice(0, 1500), '```'] : []),
      ''
    ])
  )
  .join('\n');

const mdPath = join(REPORT_DIR, `${stamp}.md`);
writeFileSync(mdPath, md, 'utf-8');

const failed = steps.filter((s) => s.status === 'fail');
process.stderr.write(`\n报告：${mdPath}\n`);
if (failed.length > 0) {
  process.stderr.write(`失败 ${failed.length} 步：${failed.map((s) => s.id).join(', ')}\n`);
  process.exitCode = 1;
}
