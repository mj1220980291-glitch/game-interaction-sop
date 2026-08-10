import { describe, expect, it, vi } from 'vitest';
import type { Tool, ListToolsResult, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  buildNativeTools,
  createServer,
  type CreateServerOptions
} from '../src/server/createServer.js';

/**
 * Spec: openspec/changes/proxy-figma-console-tools-from-engine/specs/engine-mcp-server/spec.md
 *
 * Verifies the proxy layer: tool list union, dispatch routing, schema
 * fidelity, and name-collision detection.
 *
 * The MCP `Server` keeps its request handlers private. To exercise dispatch
 * without spinning a transport, we reach into the same private slots used
 * by mcp-sdk to record handlers (`_requestHandlers`). This is the same
 * surface mcp-sdk uses internally and is stable across patch releases.
 */

interface ServerInternals {
  _requestHandlers: Map<
    string,
    (request: unknown, extra?: unknown) => Promise<unknown> | unknown
  >;
}

function getHandler(server: ReturnType<typeof createServer>, method: string) {
  const internals = server as unknown as ServerInternals;
  const handler = internals._requestHandlers.get(method);
  if (!handler) throw new Error(`no handler registered for ${method}`);
  return handler;
}

const FAKE_CHILD_TOOL_A: Tool = {
  name: 'figma_capture_screenshot',
  description: 'mock: capture a screenshot of a node',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'node id' },
      format: { type: 'string', enum: ['PNG', 'JPG'] }
    },
    required: ['nodeId'],
    additionalProperties: false
  } as Tool['inputSchema']
};

const FAKE_CHILD_TOOL_B: Tool = {
  name: 'figma_get_status',
  description: 'mock: get plugin status',
  inputSchema: {
    type: 'object',
    properties: {
      probe: { type: 'boolean' }
    }
  } as Tool['inputSchema']
};

function makeFakeClient(callImpl?: (req: { name: string; arguments: unknown }) => Promise<CallToolResult>) {
  const calls: Array<{ name: string; arguments: unknown }> = [];
  const client = {
    callTool: vi.fn(async (req: { name: string; arguments: unknown }) => {
      calls.push(req);
      if (callImpl) return callImpl(req);
      return {
        content: [{ type: 'text' as const, text: `mock-result-for-${req.name}` }]
      };
    }),
    listTools: vi.fn(async () => ({
      tools: [FAKE_CHILD_TOOL_A, FAKE_CHILD_TOOL_B]
    } as ListToolsResult))
  };
  return { client: client as unknown as Client, calls };
}

describe('proxy — tools/list union', () => {
  it('returns native + proxy tools concatenated', async () => {
    const { client } = makeFakeClient();
    const opts: CreateServerOptions = {
      proxyClient: client,
      proxyTools: [FAKE_CHILD_TOOL_A, FAKE_CHILD_TOOL_B]
    };
    const server = createServer(opts);
    const handler = getHandler(server, 'tools/list');
    const result = (await handler({ method: 'tools/list', params: {} })) as ListToolsResult;
    const names = result.tools.map((t) => t.name);

    const nativeNames = buildNativeTools(opts).map((d) => d.tool.name);
    expect(names).toEqual([...nativeNames, FAKE_CHILD_TOOL_A.name, FAKE_CHILD_TOOL_B.name]);
  });

  it('preserves proxy tool inputSchema verbatim (no zod conversion)', async () => {
    const { client } = makeFakeClient();
    const server = createServer({
      proxyClient: client,
      proxyTools: [FAKE_CHILD_TOOL_A]
    });
    const handler = getHandler(server, 'tools/list');
    const result = (await handler({ method: 'tools/list', params: {} })) as ListToolsResult;
    const proxied = result.tools.find((t) => t.name === FAKE_CHILD_TOOL_A.name);
    expect(proxied?.inputSchema).toEqual(FAKE_CHILD_TOOL_A.inputSchema);
    expect(proxied?.description).toBe(FAKE_CHILD_TOOL_A.description);
  });
});

describe('proxy — tools/call dispatch', () => {
  it('routes native tool to native handler without touching proxyClient', async () => {
    const { client, calls } = makeFakeClient();
    const server = createServer({
      proxyClient: client,
      proxyTools: [FAKE_CHILD_TOOL_A]
    });
    const handler = getHandler(server, 'tools/call');
    const result = (await handler({
      method: 'tools/call',
      params: { name: 'validate_v2_markdown', arguments: { markdown: '# x\n' } }
    })) as CallToolResult;

    expect(calls).toEqual([]); // no forwarding happened
    expect(result.content).toBeDefined();
  });

  it('forwards proxy tool calls to client.callTool with verbatim arguments', async () => {
    const { client, calls } = makeFakeClient();
    const server = createServer({
      proxyClient: client,
      proxyTools: [FAKE_CHILD_TOOL_A]
    });
    const handler = getHandler(server, 'tools/call');
    const args = { nodeId: '1:42', format: 'PNG' };
    const result = (await handler({
      method: 'tools/call',
      params: { name: FAKE_CHILD_TOOL_A.name, arguments: args }
    })) as CallToolResult;

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ name: FAKE_CHILD_TOOL_A.name, arguments: args });
    expect((result.content[0] as { type: string; text: string }).text).toBe(
      `mock-result-for-${FAKE_CHILD_TOOL_A.name}`
    );
  });

  it('returns TOOL_NOT_FOUND error for unknown name', async () => {
    const { client } = makeFakeClient();
    const server = createServer({
      proxyClient: client,
      proxyTools: [FAKE_CHILD_TOOL_A]
    });
    const handler = getHandler(server, 'tools/call');
    const result = (await handler({
      method: 'tools/call',
      params: { name: 'this_tool_does_not_exist', arguments: {} }
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const body = JSON.parse(
      (result.content[0] as { type: string; text: string }).text
    ) as { code: string };
    expect(body.code).toBe('TOOL_NOT_FOUND');
  });
});

describe('proxy — name collision guard', () => {
  it('aborts the process when a proxy tool name shadows a native tool', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit called with ${code}`);
    }) as never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() =>
      createServer({
        proxyTools: [
          {
            name: 'validate_v2_markdown', // collides with native
            description: 'colliding mock',
            inputSchema: { type: 'object' } as Tool['inputSchema']
          }
        ]
      })
    ).toThrow(/process\.exit called with 1/);

    expect(stderrSpy).toHaveBeenCalled();
    const written = (stderrSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(written).toContain('tool name collision');
    expect(written).toContain('validate_v2_markdown');

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
