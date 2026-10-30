/**
 * 常驻桥宿主（sidecar）。
 *
 * 为什么要有这个进程：figma-console-mcp 是 worker 的子进程，worker 一换（改代码、
 * 崩溃、supervisor 重启）它就跟着死，Figma 插件必须重连；更糟的是旧子进程偶尔
 * 死不掉，新旧两个分占 9223 / 9224，插件连一个、我们连另一个 —— 表现为渲染报
 * `Cannot connect` 而代理调用正常（HANDOFF 坑 26）。
 *
 * 这里把桥挪到一个**独立、脱离父进程**的宿主里：
 *
 *   bridgeHost（detached，监听 127.0.0.1:GISOP_BRIDGE_RELAY_PORT）
 *    ├─ child: npx figma-console-mcp@latest（真正跟插件对话，占 9223）
 *    └─ TCP ⇄ stdio 转发：worker 连上来就把字节原样转给 child
 *
 * 于是：worker 重启用不着动桥，插件一直连着同一个进程；桥自己挂了由宿主重启
 * child；宿主挂了下次启动时 supervisor 会重新拉起（见 ensureBridgeHost）。
 *
 * 只做字节转发，不解析 MCP：任何协议变化都不用改这里。
 */

import { spawn } from 'node:child_process';
import { createServer, type Server, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';

/** 中转端口；跟插件用的 9223（Bridge）不是一回事。 */
export const BRIDGE_RELAY_PORT = 9222;

const RESTART_DELAY_MS = 3000;
const MAX_RESTARTS = 20;

function log(message: string): void {
  process.stderr.write(`[bridge-host] ${message}\n`);
}

export interface BridgeHostHandle {
  port: number;
  close: () => Promise<void>;
}

/**
 * 起一个桥宿主：监听中转端口，并把每个连上来的 socket 与 child 的 stdio 对接。
 *
 * 每个 socket 各自起一个 child 是错误的（插件只认一个），所以这里只维护**一个**
 * child：第一个 socket 到达时启动，最后一个 socket 断开时保留（worker 可能马上
 * 重连）。
 */
export async function startBridgeHost(
  opts: { port?: number; command?: string; args?: string[] } = {}
): Promise<BridgeHostHandle> {
  const port = opts.port ?? Number(process.env.GISOP_BRIDGE_RELAY_PORT ?? BRIDGE_RELAY_PORT);
  const command = opts.command ?? 'npx';
  const args = opts.args ?? ['-y', 'figma-console-mcp@latest'];

  const sockets = new Set<Socket>();
  let child: ReturnType<typeof spawn> | undefined;
  let restarts = 0;

  const spawnChild = (): void => {
    child = spawn(command, args, {
      env: { ...process.env, ENABLE_MCP_APPS: 'true' },
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true
    });
    log(`child figma-console-mcp started pid=${child.pid ?? '?'}`);

    child.on('exit', (code, signal) => {
      log(`child exited code=${code ?? '?'} signal=${signal ?? '?'}`);
      child = undefined;
      for (const s of sockets) s.destroy();
      sockets.clear();
      if (restarts >= MAX_RESTARTS) {
        log(`giving up after ${MAX_RESTARTS} restarts`);
        return;
      }
      restarts += 1;
      setTimeout(spawnChild, RESTART_DELAY_MS);
    });
  };

  const attach = (socket: Socket): void => {
    sockets.add(socket);
    if (!child) spawnChild();
    const proc = child;
    if (!proc) return;

    socket.on('data', (chunk) => proc.stdin?.write(chunk));
    proc.stdout?.on('data', (chunk) => {
      for (const s of sockets) s.write(chunk);
    });
    const drop = (): void => {
      sockets.delete(socket);
      socket.destroy();
    };
    socket.on('close', drop);
    socket.on('error', drop);
  };

  const server: Server = createServer(attach);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  log(`listening on 127.0.0.1:${port}`);

  return {
    port,
    close: async () => {
      for (const s of sockets) s.destroy();
      sockets.clear();
      child?.kill();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

/** 中转端口上有没有人在听（用来判断宿主还活着）。 */
export async function isBridgeHostUp(port = BRIDGE_RELAY_PORT, timeoutMs = 400): Promise<boolean> {
  const net = await import('node:net');
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** 被 supervisor / 手动当成独立进程拉起来时自跑。 */
const entry = process.argv[1];
if (entry !== undefined && /bridgeHost\.(js|ts)$/.test(entry)) {
  startBridgeHost().catch((err) => {
    log(`fatal: ${(err as Error).message}`);
    process.exit(1);
  });
}

/**
 * 确保常驻宿主在跑：不在就 detached 起一个（脱离本进程，本进程退出它也不死），
 * 并等它开始监听。
 *
 * 只在 supervisor 启动时调一次。起不来就返回 false，worker 会退回自己拉子进程。
 */
export async function ensureBridgeHost(
  opts: { port?: number; waitMs?: number } = {}
): Promise<boolean> {
  const port = opts.port ?? Number(process.env.GISOP_BRIDGE_RELAY_PORT ?? BRIDGE_RELAY_PORT);
  const waitMs = opts.waitMs ?? 3000;
  if (await isBridgeHostUp(port)) {
    log(`already running on ${port}`);
    return true;
  }

  const hostEntry = fileURLToPath(new URL('./bridgeHost.js', import.meta.url));
  const child = spawn(process.execPath, [hostEntry], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, GISOP_BRIDGE_RELAY_PORT: String(port) },
    windowsHide: true
  });
  child.unref();
  log(`spawned detached host pid=${child.pid ?? '?'} on ${port}`);

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await isBridgeHostUp(port, 300)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  log(`host did not come up within ${waitMs}ms`);
  return false;
}
