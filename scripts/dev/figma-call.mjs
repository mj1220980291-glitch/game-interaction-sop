#!/usr/bin/env node
/**
 * 开发期直连 Figma：以 MCP 客户端身份拉起引擎 worker，调一个工具就退出。
 *
 * 为什么需要：CodeMaker 会话里不一定挂着 `figma-interaction-doc-engine` 的 MCP，
 * 但调试/验收经常要临时跑一次 `figma_execute` 或 `figma_probe_template`。
 * 过去每换一个会话就重写一遍这个脚本（2026-11-11~12 重写了三次），现在固定下来。
 *
 * 用法（在本目录执行，或在仓库根用 npm 脚本）：
 *   node scripts/dev/figma-call.mjs status                  # 已连的文件
 *   node scripts/dev/figma-call.mjs sel                     # 当前选区
 *   node scripts/dev/figma-call.mjs exec <file.js> [fileKey]  # 执行 JS（可先切文件）
 *   node scripts/dev/figma-call.mjs call <tool> <args.json> [fileKey]
 *
 * 注意：
 * - 引擎抢不到 9223 时会退到 9224（插件连的是 9223），先跑
 *   `node scripts/cleanup-orphan-mcp.mjs --force` 再执行本脚本。
 * - 只走「活动文件」；要操作别的已连文件，传 fileKey 让它先切过去。
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, '..', '..', 'packages', 'figma-mcp-server');
const ENTRY = join(ENGINE, 'dist', 'server', 'index.js');

const mode = process.argv[2] ?? 'status';
const text = (r) => (r.content ?? []).map((c) => c.text ?? '').join('\n');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [ENTRY],
  // worker 模式：绕开 supervisor 单例锁，跑完即退，不影响宿主里那份
  env: { ...process.env, FIGMA_BACKEND: 'figma-console', GAME_SOP_SUPERVISOR: '0' },
  cwd: ENGINE,
  stderr: 'inherit'
});

const client = new Client({ name: 'dev-figma-call', version: '0' }, { capabilities: {} });
await client.connect(transport);

// 插件被踢掉后会重扫端口；连续两次探活成功再继续，避开「重连中的假活」
let ok = 0;
for (let i = 0; i < 20 && ok < 2; i += 1) {
  try {
    const st = text(await client.callTool({ name: 'figma_get_status', arguments: { probe: true } }));
    ok = st.includes('"probeResult":{"success":true') && !st.includes('"connectedFiles":[]') ? ok + 1 : 0;
    if (i === 0) console.log('FILES', (/"connectedFiles":(\[[\s\S]*?\])/.exec(st)?.[1] ?? '[]').replace(/\s+/g, ' '));
  } catch {
    ok = 0;
  }
  if (ok < 2) await new Promise((r) => setTimeout(r, 3000));
}
if (ok < 2) {
  console.error('插件未连接：在 Figma 里 Plugins → Development → Figma Desktop Bridge 跑一次');
  process.exit(1);
}

const navigate = async (fileKey) => {
  if (!fileKey) return;
  await client.callTool({ name: 'figma_navigate', arguments: { url: `https://www.figma.com/design/${fileKey}` } });
};

if (mode === 'sel') {
  await navigate(process.argv[3]);
  console.log(text(await client.callTool({ name: 'figma_get_selection', arguments: {} })).slice(0, 6000));
} else if (mode === 'exec') {
  await navigate(process.argv[4]);
  const code = readFileSync(process.argv[3], 'utf-8');
  const r = await client.callTool(
    { name: 'figma_execute', arguments: { code, timeout: 30000 } },
    undefined,
    { timeout: 120_000 }
  );
  console.log(text(r).slice(0, 12000));
} else if (mode === 'call') {
  await navigate(process.argv[5]);
  const args = JSON.parse(readFileSync(process.argv[4], 'utf-8'));
  const r = await client.callTool({ name: process.argv[3], arguments: args }, undefined, { timeout: 240_000 });
  console.log(text(r).slice(0, 12000));
}

await client.close();
