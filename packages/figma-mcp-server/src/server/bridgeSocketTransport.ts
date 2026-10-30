/**
 * 让 MCP 客户端通过 TCP 连到常驻桥宿主（见 bridgeHost.ts）。
 *
 * 帧格式跟 stdio 一致：一行一个 JSON-RPC 消息，`\n` 分隔。宿主只做字节转发，
 * 所以这里也不解析业务语义。
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import net from 'node:net';

export class SocketClientTransport implements Transport {
  onmessage?: <T extends JSONRPCMessage>(message: T) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  private buffer = '';

  constructor(private readonly socket: net.Socket) {}

  /** 宿主不暴露 pid；保持 undefined，调用方应当据此跳过树杀。 */
  get pid(): undefined {
    return undefined;
  }

  async start(): Promise<void> {
    this.socket.setEncoding('utf-8');
    this.socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      let index = this.buffer.indexOf('\n');
      while (index !== -1) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (line) this.emitLine(line);
        index = this.buffer.indexOf('\n');
      }
    });
    this.socket.on('close', () => this.onclose?.());
    this.socket.on('error', (err) => this.onerror?.(err));
  }

  private emitLine(line: string): void {
    try {
      this.onmessage?.(JSON.parse(line) as JSONRPCMessage);
    } catch (err) {
      this.onerror?.(err as Error);
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.socket.destroyed) throw new Error('bridge socket closed');
    this.socket.write(`${JSON.stringify(message)}\n`);
  }

  async close(): Promise<void> {
    this.socket.destroy();
    this.onclose?.();
  }
}

/** 连常驻桥宿主；连不上就抛错，由调用方退回「自己拉子进程」。 */
export async function connectBridgeHost(
  port: number,
  timeoutMs = 800
): Promise<{ transport: SocketClientTransport; socket: net.Socket }> {
  const socket = net.connect({ port, host: '127.0.0.1' });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`bridge host not reachable on 127.0.0.1:${port}`));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return { transport: new SocketClientTransport(socket), socket };
}
