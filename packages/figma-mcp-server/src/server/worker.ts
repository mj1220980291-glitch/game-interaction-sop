/**
 * 业务 worker：真正持有 Figma 后端与全部工具实现的 MCP server。
 *
 * 由 `index.ts` 的常驻父进程按需拉起/替换，也可以单独跑（`GAME_SOP_WORKER=1`），
 * 这时它就是原来的引擎本身。父进程通过 stdio 以 MCP client 身份连过来，把
 * `tools/list` / `tools/call` 原样转给上游。
 *
 * Spec: openspec/changes/proxy-figma-console-tools-from-engine/specs/engine-mcp-server/spec.md
 *
 * Wiring (when FIGMA_BACKEND=figma-console):
 *   1. Reclaim Bridge ports held by orphans from a previous engine, so our
 *      child can bind the preferred port (see reclaimPorts.ts).
 *   2. Spawn `npx -y figma-console-mcp@latest` as a stdio MCP child.
 *   3. Connect to the child as an MCP client.
 *   4. Call `listTools()` to capture every tool the child exposes — these
 *      become "proxy tools" served verbatim to upstream callers via this
 *      engine's MCP server.
 *   5. Build the v2Backend on top of `client.callTool({ name: 'figma_execute' })`.
 *   6. createServer with v2Backend + proxyClient + proxyTools.
 *   7. Bind the engine's stdio server transport.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'node:url';
import { createServer } from './createServer.js';
import { buildFigmaConsoleBackend } from './figmaConsoleBackend.js';
import { warnOnExternalFigmaConsoleInstances } from './detectExternal.js';
import { installChildCleanup } from './childLifecycle.js';
import {
  reclaimOrphanedBridgePorts,
  reclaimPreferredPort,
  waitUntilPortBindable,
  parseBridgePortStatus,
  PREFERRED_BRIDGE_PORT
} from './reclaimPorts.js';

export async function main(): Promise<void> {
  let v2Backend = undefined;
  let proxyClient: Client | undefined;
  let proxyTools: Tool[] = [];

  if (process.env.FIGMA_BACKEND === 'figma-console') {
    const token = process.env.FIGMA_ACCESS_TOKEN ?? '';

    // Before spawning: take back any Bridge port still held by an orphan from
    // a previous engine. Without this our child falls back to 9224 while the
    // Figma plugin stays connected to the dead engine's leftover on 9223.
    try {
      const reclaimed = reclaimOrphanedBridgePorts();
      for (const { pid, port } of reclaimed.killed) {
        process.stderr.write(
          `[figma-interaction-doc-engine] reclaimed Bridge port ${port ?? '?'} ` +
            `from orphaned figma-console-mcp pid=${pid}\n`
        );
      }
      for (const { pid, port, reason } of reclaimed.skipped) {
        process.stderr.write(
          `[figma-interaction-doc-engine] left figma-console-mcp pid=${pid} ` +
            `(port ${port ?? '?'}) running: ${reason}\n`
        );
      }
    } catch (err) {
      process.stderr.write(
        `[figma-interaction-doc-engine] port reclaim failed: ${(err as Error).message}\n`
      );
    }

    // 首选端口如果被「活着的旧实例」占着，孤儿回收是看不见的（它的父链还在）：
    // 新子进程会退到 9224，而插件只认启动时扫到的端口，等于永久失联。
    // 这一步必须在 spawn 之前做——抢先占住 9223，插件重连才能找回来。
    try {
      const taken = reclaimPreferredPort();
      if (taken.action === 'reclaimed') {
        process.stderr.write(
          `[figma-interaction-doc-engine] reclaimed preferred port ${taken.port} ` +
            `from pid=${taken.pid}\n`
        );
      } else if (taken.action === 'skipped' || taken.action === 'degraded') {
        process.stderr.write(
          `[figma-interaction-doc-engine] preferred port ${taken.port} left as-is ` +
            `(pid=${taken.pid ?? '?'}): ${taken.reason}\n`
        );
      }
    } catch (err) {
      process.stderr.write(
        `[figma-interaction-doc-engine] preferred-port reclaim failed: ${(err as Error).message}\n`
      );
    }

    // 杀掉旧实例后端口仍可能被 TIME_WAIT 挡着：等它真的能 listen 再 spawn，
    // 否则子进程会安静地退回 9224，插件（只认扫到的端口）永远连不上。
    try {
      const bindable = await waitUntilPortBindable(PREFERRED_BRIDGE_PORT);
      if (!bindable) {
        process.stderr.write(
          `[figma-interaction-doc-engine] port ${PREFERRED_BRIDGE_PORT} still not bindable ` +
            'after 5s; child will fall back\n'
        );
      }
    } catch (err) {
      process.stderr.write(
        `[figma-interaction-doc-engine] port bind probe failed: ${(err as Error).message}\n`
      );
    }

    const startChild = async (): Promise<{ client: Client; transport: StdioClientTransport }> => {
      const c = new Client({ name: 'figma-interaction-doc-engine', version: '0.1.0' });
      const t = new StdioClientTransport({
        command: 'npx',
        args: ['-y', 'figma-console-mcp@latest'],
        env: {
          ...process.env,
          FIGMA_ACCESS_TOKEN: token,
          ENABLE_MCP_APPS: 'true'
        }
      });

      // Fail-fast: if the child dies, the worker cannot serve render_v2 nor any
      // proxied figma_* tool. Exit so the supervisor swaps in a fresh worker.
      t.onclose = () => {
        process.stderr.write(
          '[figma-interaction-doc-engine] child figma-console-mcp transport closed; worker exiting\n'
        );
        process.exit(1);
      };
      t.onerror = (err: Error) => {
        process.stderr.write(
          `[figma-interaction-doc-engine] child figma-console-mcp transport error: ${err.message}\n`
        );
        process.exit(1);
      };

      await c.connect(t);

      // The transport only owns the outer `cmd.exe`; the process that actually
      // binds the Bridge port is two levels below it and outlives every kill the
      // SDK performs. Register a tree-kill so restarting the worker does not
      // leave an orphan squatting port 9223. See childLifecycle.ts.
      const childPid = t.pid ?? undefined;
      if (childPid != null) {
        installChildCleanup(childPid);
      } else {
        process.stderr.write(
          '[figma-interaction-doc-engine] WARNING: child PID unavailable; ' +
            'cannot guarantee cleanup of the figma-console-mcp subtree on exit\n'
        );
      }
      return { client: c, transport: t };
    };

    let { client, transport: childTransport } = await startChild();

    // 端口自愈（非阻塞）：子进程退到 9224 时不报错，只是插件连在 9223、我们连在
    // 9224，表现为「渲染报 Cannot connect，代理的 figma_execute 却正常」。
    // 这里只做两件事：把占着首选端口的同类进程清掉（下一次启动就能回到 9223），
    // 以及留一条能搜到的告警。不在这里重启子进程——实测重启后仍可能抢不到端口，
    // 反而把首屏启动拖慢。
    void (async () => {
      try {
        const status = await client.callTool({ name: 'figma_get_status', arguments: {} });
        const text = String(
          (status as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? ''
        );
        const info = parseBridgePortStatus(text);
        if (!info?.fallbackUsed) return;
        process.stderr.write(
          `[figma-interaction-doc-engine] WARNING: bridge child fell back to port ` +
            `${info.port ?? '?'} (preferred ${info.preferredPort ?? PREFERRED_BRIDGE_PORT}); ` +
            'renders will fail with "Cannot connect" while proxied figma_* calls still work. ' +
            'Clearing the squatter so the next start returns to the preferred port.\n'
        );
        const taken = reclaimPreferredPort();
        process.stderr.write(
          `[figma-interaction-doc-engine] preferred port cleanup: ${taken.action}` +
            `${taken.pid ? ` pid=${taken.pid}` : ''}` +
            `${taken.reason ? ` (${taken.reason})` : ''}\n`
        );
      } catch (err) {
        process.stderr.write(
          `[figma-interaction-doc-engine] port self-check failed: ${(err as Error).message}\n`
        );
      }
    })();

    // Capture the child's tool list once, at startup. The list is stable for
    // the lifetime of the child process; we serve it verbatim to upstream.
    const list = await client.listTools();
    proxyTools = list.tools;
    proxyClient = client;
    v2Backend = buildFigmaConsoleBackend(client);

    process.stderr.write(
      `[figma-interaction-doc-engine] v2Backend wired via figma-console-mcp; ` +
        `${proxyTools.length} child tool(s) will be proxied\n`
    );

    // Best-effort: warn if there is another figma-console-mcp process bound
    // to a port we don't own. This usually means a separate `figma-console`
    // MCP server is also configured in CodeMaker, which will cause the
    // Figma Bridge plugin to connect to the other instance and starve us
    // of plugin access.
    try {
      const pid = childTransport.pid ?? undefined;
      warnOnExternalFigmaConsoleInstances(pid);
    } catch (err) {
      process.stderr.write(
        `[figma-interaction-doc-engine] external-instance detection failed: ${(err as Error).message}\n`
      );
    }
  }

  const server = createServer({ v2Backend, proxyClient, proxyTools });
  const transport = new StdioServerTransport();
  // 父进程换人时会关掉这条管道：worker 必须自己退，不要赖在后台抢 Bridge 端口
  // （父进程拿不到子进程 pid 时杀不掉它，见 index.ts killAndWait）。
  const die = (): void => process.exit(0);
  transport.onclose = die;
  process.stdin.once('end', die);
  process.stdin.once('close', die);
  await server.connect(transport);

  // Stderr-only banner so JSON-RPC framing on stdout stays clean.
  process.stderr.write(
    '[figma-interaction-doc-engine] worker ready — ' +
      `native: validate_v2_markdown, render_v2_markdown_to_figma; ` +
      `proxy: ${proxyTools.length}\n`
  );
}

/**
 * 被父进程当子进程拉起时（`node dist/server/worker.js`）自己跑；
 * 被 `index.ts` import 时不自动跑，由父进程决定何时启动。
 */
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    process.stderr.write(`[figma-interaction-doc-engine] worker fatal: ${(err as Error).stack ?? err}\n`);
    process.exit(1);
  });
}
