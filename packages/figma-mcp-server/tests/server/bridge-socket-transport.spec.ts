/**
 * 常驻桥宿主的中转协议：一行一个 JSON-RPC，`\n` 分隔（跟 stdio 一致）。
 *
 * 这里只测客户端帧解析与写回，不碰真实 figma-console。
 */

import { describe, it, expect } from 'vitest';
import net from 'node:net';
import { SocketClientTransport, connectBridgeHost } from '../../src/server/bridgeSocketTransport.js';
import { isBridgeHostUp } from '../../src/server/bridgeHost.js';

async function withServer<T>(fn: (port: number, server: net.Server) => Promise<T>): Promise<T> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  try {
    return await fn(address.port, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('SocketClientTransport', () => {
  it('按行切分 JSON-RPC，跨 chunk 的半行能拼回来', async () => {
    await withServer(async (port, server) => {
      server.on('connection', (socket) => {
        socket.write('{"jsonrpc":"2.0","id":1,"res');
        socket.write('ult":{}}\n');
        socket.write('{"jsonrpc":"2.0","method":"x"}\n');
      });

      const { transport, socket } = await connectBridgeHost(port);
      const seen: unknown[] = [];
      transport.onmessage = (m) => seen.push(m);
      await transport.start();

      await new Promise((r) => setTimeout(r, 150));
      expect(seen).toHaveLength(2);
      expect((seen[0] as { id: number }).id).toBe(1);
      socket.destroy();
    });
  });

  it('send 写出去是一行 JSON', async () => {
    await withServer(async (port, server) => {
      const received: string[] = [];
      server.on('connection', (socket) => {
        socket.on('data', (chunk) => received.push(String(chunk)));
      });

      const { transport, socket } = await connectBridgeHost(port);
      await transport.start();
      await transport.send({ jsonrpc: '2.0', id: 7, method: 'ping' } as never);

      await new Promise((r) => setTimeout(r, 120));
      expect(received.join('').trim()).toBe('{"jsonrpc":"2.0","id":7,"method":"ping"}');
      socket.destroy();
    });
  });

  it('连不上时报错（调用方据此退回自拉子进程）', async () => {
    await expect(connectBridgeHost(1, 200)).rejects.toThrow();
  });
});

describe('isBridgeHostUp', () => {
  it('没有监听者时为 false', async () => {
    expect(await isBridgeHostUp(1, 200)).toBe(false);
  });

  it('有监听者时为 true', async () => {
    await withServer(async (port) => {
      expect(await isBridgeHostUp(port, 500)).toBe(true);
    });
  });
});
