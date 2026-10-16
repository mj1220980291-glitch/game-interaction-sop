/**
 * MCP Stdio Server entrypoint.
 *
 * Spec: openspec/changes/proxy-figma-console-tools-from-engine/specs/engine-mcp-server/spec.md
 *
 * Exposes a single MCP server that combines:
 *   - 2 native tools owned by figma-interaction-doc-engine itself:
 *       1. validate_v2_markdown         (no backend needed)
 *       2. render_v2_markdown_to_figma  (needs V2FigmaBackend)
 *   - All tools dynamically forwarded from a child figma-console-mcp process
 *     (see `index.ts` for spawn wiring). The list is captured once at startup
 *     via `client.listTools()` and passed in as `proxyTools`.
 *
 * The server is built on the lower-level `Server` class (NOT `McpServer`) so
 * that proxied tools' raw JSON Schema can be served verbatim to upstream
 * hosts without zod conversion. See design.md decision #1.
 *
 * Tool name collisions between native and proxy tools are detected at
 * createServer() time and abort the process with a stderr message.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  parseV2,
  renderV2MarkdownToFigma,
  type AssetSpec,
  type FigmaBackend as V2FigmaBackend
} from '../v2/index.js';

// =========================================================================
// Public types
// =========================================================================

export interface CreateServerOptions {
  /**
   * v2 backend implementing the new high-level Figma operations
   * (clone, set-text, delete, reparent, etc.). Required for
   * `render_v2_markdown_to_figma`.
   */
  v2Backend?: V2FigmaBackend;
  /** Server name for MCP identification. Defaults to 'figma-interaction-doc-engine'. */
  name?: string;
  /** Server version. */
  version?: string;
  /**
   * Connected MCP client to a child figma-console-mcp process. When set in
   * combination with `proxyTools`, every tool name in `proxyTools` becomes
   * available on this server and is forwarded to the child via
   * `client.callTool(...)`.
   */
  proxyClient?: Client;
  /**
   * Raw JSON-Schema-bearing tool descriptors as returned by
   * `client.listTools()`. The dispatcher serves these verbatim from
   * `tools/list` and routes incoming `tools/call` to the proxy client.
   */
  proxyTools?: Tool[];
}

export const ServerErrorCodes = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  V2_BACKEND_UNAVAILABLE: 'V2_BACKEND_UNAVAILABLE',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND'
} as const;

export interface NativeToolDef {
  tool: Tool;
  handler: NativeToolHandler;
}

export type NativeToolHandler = (
  args: Record<string, unknown>
) => Promise<CallToolResult>;

// =========================================================================
// Native tool input schemas (raw JSON Schema, served verbatim to clients)
// =========================================================================

const V2_VALIDATE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    markdown: { type: 'string', minLength: 1 }
  },
  required: ['markdown'],
  additionalProperties: false
} as const;

const V2_CROP_JSON = {
  type: 'object',
  description: 'Region of the source node, in its local coords (top-left origin).',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number', exclusiveMinimum: 0 },
    height: { type: 'number', exclusiveMinimum: 0 }
  },
  required: ['x', 'y', 'width', 'height'],
  additionalProperties: false
} as const;

const V2_ASSET_SPEC_JSON = {
  anyOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'image' },
        src: { type: 'string', minLength: 1 }
      },
      required: ['type', 'src'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { const: 'figma_node' },
        fileKey: { type: 'string', minLength: 1 },
        nodeId: { type: 'string', minLength: 1 },
        crop: V2_CROP_JSON,
        scale: { type: 'number', exclusiveMinimum: 0 }
      },
      required: ['type', 'fileKey', 'nodeId'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { const: 'skip' }
      },
      required: ['type'],
      additionalProperties: false
    }
  ]
};

const V2_RENDER_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    markdown: { type: 'string', minLength: 1 },
    assetMap: {
      type: 'object',
      additionalProperties: V2_ASSET_SPEC_JSON
    },
    target: {
      type: 'object',
      properties: {
        fileKey: { type: 'string' },
        pageId: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  required: ['markdown'],
  additionalProperties: false
} as const;

// =========================================================================
// Native tool definitions
// =========================================================================

/**
 * Build the engine's own native tool list and handlers. Exposed so unit
 * tests can call handlers directly without spinning up a transport.
 */
export function buildNativeTools(opts: CreateServerOptions = {}): NativeToolDef[] {
  const validateV2Markdown: NativeToolDef = {
    tool: {
      name: 'validate_v2_markdown',
      description:
        '校验 v2 Markdown 是否通过强校验。不调用 Figma。返回 ok/errors/warnings/ir。',
      inputSchema: V2_VALIDATE_INPUT_SCHEMA as unknown as Tool['inputSchema']
    },
    handler: async (args) => {
      try {
        const markdown = String(args?.markdown ?? '');
        const r = parseV2(markdown);
        return jsonResult(r);
      } catch (e) {
        return errorResult(ServerErrorCodes.INTERNAL_ERROR, (e as Error).message);
      }
    }
  };

  const renderV2MarkdownTool: NativeToolDef = {
    tool: {
      name: 'render_v2_markdown_to_figma',
      description:
        '把 v2 Markdown 写入 Figma 模板 1:14。需要在 createServer 时传入 v2Backend。' +
        'assetMap 两类键：' +
        '① "NN" = 第 NN 章主图，值为 image / figma_node / skip，缺省按 skip；' +
        '② "NN/C/K" = 第 NN 章第 C 簇的第 K 张配图（C、K 从 1 起；K 按该簇全部「配图：」bullet 的文档顺序计，跨 #### 连续不重置），值为 figma_node / skip。' +
        'figma_node 可带 crop:{x,y,width,height}（相对源节点左上角）裁出局部，配图占位按裁出区域的宽高比定高（宽度上限为说明栏宽，小图不放大）。' +
        '源节点必须在渲染目标文件内。' +
        '例：{ "01": { type:"figma_node", fileKey:"…", nodeId:"588:6399" }, "01/1/2": { type:"figma_node", fileKey:"…", nodeId:"588:6399", crop:{ x:700, y:0, width:520, height:160 } } }。' +
        '匹配不到的键与单张配图失败均为软告警，不中断渲染。',
      inputSchema: V2_RENDER_INPUT_SCHEMA as unknown as Tool['inputSchema']
    },
    handler: async (args) => {
      try {
        if (!opts.v2Backend) {
          return errorResult(
            ServerErrorCodes.V2_BACKEND_UNAVAILABLE,
            'v2Backend 未配置；本工具需要在 createServer({ v2Backend }) 初始化时传入。',
            'validate_v2_markdown 仍可用。'
          );
        }
        const markdown = String(args?.markdown ?? '');
        const assetMap = args?.assetMap as Record<string, AssetSpec> | undefined;
        const assetError = findInvalidAsset(assetMap);
        if (assetError) {
          return errorResult(ServerErrorCodes.INVALID_INPUT, assetError);
        }
        const target = args?.target as { fileKey?: string; pageId?: string } | undefined;
        const result = await renderV2MarkdownToFigma(
          { markdown, assetMap, target },
          opts.v2Backend
        );
        return jsonResult(result);
      } catch (e) {
        const err = e as Error & { code?: string };
        return errorResult(err.code ?? ServerErrorCodes.INTERNAL_ERROR, err.message);
      }
    }
  };

  return [validateV2Markdown, renderV2MarkdownTool];
}

// =========================================================================
// Server factory
// =========================================================================

/**
 * Build the MCP server with native + proxied tools.
 *
 * On startup, if `proxyTools` and any `NATIVE_TOOLS` collide on `name`,
 * the process aborts with a stderr message.
 */
export function createServer(opts: CreateServerOptions = {}): Server {
  const nativeDefs = buildNativeTools(opts);
  const NATIVE_TOOLS: Tool[] = nativeDefs.map((d) => d.tool);
  const NATIVE_HANDLERS = new Map<string, NativeToolHandler>(
    nativeDefs.map((d) => [d.tool.name, d.handler])
  );

  const proxyTools = opts.proxyTools ?? [];
  const PROXY_TOOL_NAMES = new Set(proxyTools.map((t) => t.name));

  // Guard: native and proxy must not share a tool name.
  const collisions = NATIVE_TOOLS.map((t) => t.name).filter((n) =>
    PROXY_TOOL_NAMES.has(n)
  );
  if (collisions.length > 0) {
    const msg = `[figma-interaction-doc-engine] tool name collision: ${collisions.join(', ')}\n`;
    process.stderr.write(msg);
    process.exit(1);
  }

  const server = new Server(
    {
      name: opts.name ?? 'figma-interaction-doc-engine',
      version: opts.version ?? '0.1.0'
    },
    {
      capabilities: { tools: {} }
    }
  );

  // tools/list — return native + proxy in a single union.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: [...NATIVE_TOOLS, ...proxyTools] };
  });

  // tools/call — route by name.
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;

    const nativeHandler = NATIVE_HANDLERS.get(name);
    if (nativeHandler) {
      return await nativeHandler(args);
    }

    if (PROXY_TOOL_NAMES.has(name)) {
      if (!opts.proxyClient) {
        return errorResult(
          ServerErrorCodes.INTERNAL_ERROR,
          `proxy tool "${name}" requested but proxyClient is not wired`
        );
      }
      const r = await opts.proxyClient.callTool({ name, arguments: args });
      return r as CallToolResult;
    }

    return errorResult(
      ServerErrorCodes.TOOL_NOT_FOUND,
      `Tool not found: ${name}`,
      `Known native: ${NATIVE_TOOLS.map((t) => t.name).join(', ')}; ` +
        `Known proxy: ${proxyTools.map((t) => t.name).join(', ') || '(none)'}`
    );
  });

  return server;
}

// =========================================================================
// Response helpers
// =========================================================================

function jsonResult(obj: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(obj, null, 2)
      }
    ]
  };
}

/**
 * The JSON Schema above is served to hosts but not enforced here (no runtime
 * validator), so the numeric bounds that would otherwise reach the plugin as
 * a zero-size FRAME are checked by hand.
 */
function findInvalidAsset(assetMap: Record<string, AssetSpec> | undefined): string | undefined {
  if (!assetMap) return undefined;
  for (const [key, spec] of Object.entries(assetMap)) {
    if (spec?.type !== 'figma_node') continue;
    const { crop, scale } = spec;
    if (scale !== undefined && !(typeof scale === 'number' && scale > 0)) {
      return `assetMap["${key}"].scale must be a number > 0`;
    }
    if (crop === undefined) continue;
    const nums = [crop.x, crop.y, crop.width, crop.height];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return `assetMap["${key}"].crop needs numeric x, y, width, height`;
    }
    if (!(crop.width > 0 && crop.height > 0)) {
      return `assetMap["${key}"].crop width/height must be > 0`;
    }
  }
  return undefined;
}

function errorResult(code: string, message: string, hint?: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ code, message, hint }, null, 2)
      }
    ],
    isError: true
  };
}
