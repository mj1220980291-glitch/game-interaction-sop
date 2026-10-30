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
import { ensureBridgeHost } from './bridgeHost.js';
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
  const pid = transport.pid;
  return {
    client,
    tools,
    handle: {
      async stop(): Promise<void> {
        // `client.close()` 只收协议，不保证杀掉子进程（真机实测：旧 worker
        // 会赖着不走，两个 worker 抢同一个 Bridge 端口）。显式杀掉再确认退出。
        try {
          await client.close();
        } catch {
          /* worker may already be gone */
        }
        if (pid != null) await killAndWait(pid);
      }
    }
  };
}

/** 杀掉 worker 进程并等它真的消失（最多 3 秒，之后不再等）。 */
async function killAndWait(pid: number): Promise<void> {
  const alive = (): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  if (!alive()) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  for (let i = 0; i < 30; i += 1) {
    if (!alive()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
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

  // 常驻桥宿主**默认关闭**（`GISOP_BRIDGE_HOST=1` 才启用）。
  //
  // 试过一轮：桥不再随 worker 重启，插件不用重连，方向是对的；但真机上暴露出一串
  // 新的失败面（9222 被别的软件占用、Windows 上 spawn npx 要 shell、child 一抖
  // worker 就跟着退、supervisor 重试耗尽后整个服务消失）。先把开关收起来，等这些
  // 边角都处理干净再默认打开——现在的「worker 自己拉子进程 + 端口自检」是验证过的
  // 稳定路径。
  if (
    process.env.FIGMA_BACKEND === 'figma-console' &&
    process.env.GISOP_BRIDGE_HOST === '1'
  ) {
    try {
      await ensureBridgeHost();
    } catch (err) {
      process.stderr.write(
        `[figma-interaction-doc-engine] bridge host unavailable: ${(err as Error).message}\n`
      );
    }
  }

  // boot 失败会让整个 MCP 服务消失（宿主那边只会报「连接报成功但没连上」），
  // 所以这里重试几次再放弃。
  for (let attempt = 1; ; attempt += 1) {
    try {
      await loop.restart('boot');
      break;
    } catch (err) {
      process.stderr.write(
        `[figma-interaction-doc-engine] worker boot failed (attempt ${attempt}): ` +
          `${(err as Error).message}\n`
      );
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
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
