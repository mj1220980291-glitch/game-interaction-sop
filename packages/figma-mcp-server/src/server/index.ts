/**
 * 常驻父进程：持有 MCP 会话，业务全在可替换的 worker 里。
 *
 * 为什么这么拆：改一次引擎代码就要人工重启一次（CodeMaker 不会拉起已退出的 MCP
 * 进程，实测）。进程内热加载也不行 —— ESM 缓存让依赖仍是旧实例，stdio 会话也没
 * 法重新握手。父进程只做协议转发，`dist` 一变就换 worker，客户端无感。
 *
 * 转发是通用代理，不认具体工具：`tools/list` 取 worker 的工具表，`tools/call`
 * 原样转给 worker 的 MCP client。所以新增工具不需要在这里登记。
 *
 * 逃生口：`GAME_SOP_WORKER=1`（worker 自跑）或 `GAME_SOP_SUPERVISOR=0`（不起
 * 父进程，直接跑 worker），调试与老部署都用得上。
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { createWorkerLoop, type WorkerHandle } from './workerLoop.js';
import { main as runWorker } from './worker.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ENTRY = path.join(HERE, 'worker.js');
const DEBOUNCE_MS = 800;

interface RunningWorker {
  handle: WorkerHandle;
  client: Client;
  tools: Tool[];
}

async function startWorker(): Promise<RunningWorker> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [WORKER_ENTRY],
    env: { ...process.env, GAME_SOP_WORKER: '1' },
    stderr: 'inherit'
  });
  const client = new Client({ name: 'figma-interaction-doc-engine-supervisor', version: '0.2.0' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  return {
    client,
    tools,
    handle: {
      async stop(): Promise<void> {
        try {
          await client.close();
        } catch {
          /* worker may already be gone */
        }
      }
    }
  };
}

async function main(): Promise<void> {
  // 自跑模式：就是原来那个单进程引擎。
  if (process.env.GAME_SOP_WORKER === '1' || process.env.GAME_SOP_SUPERVISOR === '0') {
    await runWorker();
    return;
  }

  let current: RunningWorker | undefined;
  let tools: Tool[] = [];

  const server = new Server(
    { name: 'figma-interaction-doc-engine', version: '0.2.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const worker = current;
    if (!worker) throw new Error('engine worker not ready');
    return (await worker.client.callTool(request.params as never)) as never;
  });

  const loop = createWorkerLoop({
    spawn: async () => {
      const worker = await startWorker();
      current = worker;
      tools = worker.tools;
      return worker.handle;
    },
    log: (message) => process.stderr.write(`[figma-interaction-doc-engine] ${message}\n`)
  });

  await loop.restart('boot');
  process.stderr.write(
    `[figma-interaction-doc-engine] supervisor ready — ${tools.length} tool(s) proxied from worker\n`
  );

  // dist 一变就换 worker：build 会连写几十个文件，攒一下再换。
  let timer: NodeJS.Timeout | undefined;
  try {
    const watcher = fs.watch(HERE, { recursive: true }, (_event, filename) => {
      if (filename && !String(filename).endsWith('.js')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loop.restart('dist changed').catch((err: Error) => {
          process.stderr.write(`[figma-interaction-doc-engine] worker restart failed: ${err.message}\n`);
        });
      }, DEBOUNCE_MS);
    });
    process.on('exit', () => {
      if (timer) clearTimeout(timer);
      watcher.close();
    });
  } catch (err) {
    process.stderr.write(
      `[figma-interaction-doc-engine] auto-reload unavailable: ${(err as Error).message}\n`
    );
  }

  const transport = new StdioServerTransport();
  // 上游关掉 stdin（客户端退出 / 冒烟测试）时整个进程要跟着退，并且把 worker
  // 一起收掉 —— 否则会留下一个孤儿 worker 占着 Bridge 端口。
  const shutdown = (): void => {
    void loop.shutdown().finally(() => process.exit(0));
  };
  transport.onclose = shutdown;
  process.stdin.once('end', shutdown);
  process.stdin.once('close', shutdown);
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[figma-interaction-doc-engine] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
