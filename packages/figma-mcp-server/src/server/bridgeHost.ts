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
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 中转端口**不再写死**：9222 之类的固定值会被别的软件占掉（真机上被豆包占了，
 * 于是 worker 连上去话都握不了手）。改成绑 0（临时端口），把真实端口写进这个文件，
 * worker / supervisor 都从文件里读。
 */
export const BRIDGE_INFO_FILE = join(tmpdir(), 'gisop-bridge-host.json');

export interface BridgeHostInfo {
  port: number;
  pid: number;
}

/** 读宿主公告的端口；文件不存在或坏掉返回 undefined。 */
export function readBridgeHostInfo(): BridgeHostInfo | undefined {
  try {
    const raw = JSON.parse(readFileSync(BRIDGE_INFO_FILE, 'utf-8')) as Partial<BridgeHostInfo>;
    if (typeof raw.port === 'number' && raw.port > 0 && typeof raw.pid === 'number') {
      return { port: raw.port, pid: raw.pid };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function writeBridgeHostInfo(info: BridgeHostInfo): void {
  try {
    mkdirSync(dirname(BRIDGE_INFO_FILE), { recursive: true });
    writeFileSync(BRIDGE_INFO_FILE, JSON.stringify(info), 'utf-8');
  } catch {
    /* 公告失败不影响转发 */
  }
}

function clearBridgeHostInfo(): void {
  try {
    rmSync(BRIDGE_INFO_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

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
 * 起一个桥宿主：监听中转端口（默认临时端口），并把每个连上来的 socket 与 child
 * 的 stdio 对接。
 *
 * 每个 socket 各自起一个 child 是错误的（插件只认一个），所以这里只维护**一个**
 * child：第一个 socket 到达时启动，最后一个 socket 断开时保留（worker 可能马上
 * 重连）。
 */
export async function startBridgeHost(
  opts: { port?: number; command?: string; args?: string[] } = {}
): Promise<BridgeHostHandle> {
  const port = opts.port ?? Number(process.env.GISOP_BRIDGE_RELAY_PORT ?? 0);
  const command = opts.command ?? 'npx';
  const args = opts.args ?? ['-y', 'figma-console-mcp@latest'];

  const sockets = new Set<Socket>();
  let child: ReturnType<typeof spawn> | undefined;
  let restarts = 0;

  const spawnChild = (): void => {
    child = spawn(command, args, {
      env: { ...process.env, ENABLE_MCP_APPS: 'true' },
      stdio: ['pipe', 'pipe', 'inherit'],
      // Windows 上 `spawn('npx')` 直接 ENOENT（要 .cmd 或 shell）；给 shell 最省事。
      shell: process.platform === 'win32',
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
  const actualPort = (server.address() as AddressInfo).port;
  writeBridgeHostInfo({ port: actualPort, pid: process.pid });
  log(`listening on 127.0.0.1:${actualPort}`);

  return {
    port: actualPort,
    close: async () => {
      for (const s of sockets) s.destroy();
      sockets.clear();
      child?.kill();
      clearBridgeHostInfo();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

/** 中转端口上有没有人在听（用来判断宿主还活着）。 */
export async function isBridgeHostUp(port: number, timeoutMs = 400): Promise<boolean> {
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
 * 并等它在公告文件里报出端口。
 *
 * 只在 supervisor 启动时调一次。起不来就返回 false，worker 会退回自己拉子进程。
 */
export async function ensureBridgeHost(opts: { waitMs?: number } = {}): Promise<boolean> {
  const waitMs = opts.waitMs ?? 5000;
  const announced = readBridgeHostInfo();
  if (announced && (await isBridgeHostUp(announced.port))) {
    log(`already running on ${announced.port}`);
    return true;
  }
  // 公告文件指向一个已经死掉的宿主（被硬杀 / 崩溃）：清掉，免得一直连空气。
  if (announced) clearBridgeHostInfo();

  const hostEntry = fileURLToPath(new URL('./bridgeHost.js', import.meta.url));
  const child = spawn(process.execPath, [hostEntry], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, GISOP_BRIDGE_RELAY_PORT: '' },
    windowsHide: true
  });
  child.unref();
  log(`spawned detached host pid=${child.pid ?? '?'}`);

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const info = readBridgeHostInfo();
    if (info && (await isBridgeHostUp(info.port, 300))) {
      log(`host ready on ${info.port}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  log(`host did not come up within ${waitMs}ms`);
  return false;
}
