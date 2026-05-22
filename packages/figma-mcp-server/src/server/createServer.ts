/**
 * MCP Stdio Server entrypoint.
 *
 * Spec: openspec/changes/proxy-figma-console-tools-from-engine/specs/engine-mcp-server/spec.md
 *
 * Exposes a single MCP server that combines:
 *   - 6 native tools owned by figma-interaction-doc-engine itself:
 *       1. validate_dsl                 (no backend needed)
 *       2. dry_run_layout               (no backend needed)
 *       3. generate_interaction_doc     (needs FigmaExecuteBackend)
 *       4. replay_from_checkpoint       (needs FigmaExecuteBackend + CheckpointStore)
 *       5. validate_v2_markdown         (no backend needed)
 *       6. render_v2_markdown_to_figma  (needs V2FigmaBackend)
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
import { validate } from '../dsl/index.js';
import { plan } from '../planner/index.js';
import { CheckpointStore } from '../checkpoint/index.js';
import { Executor, type FigmaExecuteBackend } from '../executor/index.js';
import { runPipeline } from './pipeline.js';
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
  /** Legacy v0.1 backend used by `generate_interaction_doc` / `replay_from_checkpoint`. */
  backend?: FigmaExecuteBackend;
  /**
   * v2 backend implementing the new high-level Figma operations
   * (clone, set-text, delete, reparent, etc.). Required for
   * `render_v2_markdown_to_figma`.
   */
  v2Backend?: V2FigmaBackend;
  /** Override CheckpointStore root (default: process.cwd()). */
  storeRoot?: string;
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
  EXECUTOR_BACKEND_UNAVAILABLE: 'EXECUTOR_BACKEND_UNAVAILABLE',
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

const YAML_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    yaml: { type: 'string', minLength: 1 }
  },
  required: ['yaml'],
  additionalProperties: false
} as const;

const GENERATE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    yaml: { type: 'string', minLength: 1 },
    runId: { type: 'string' }
  },
  required: ['yaml'],
  additionalProperties: false
} as const;

const REPLAY_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    runId: { type: 'string', minLength: 1 },
    fromPhase: { type: 'integer', minimum: 1, maximum: 7 }
  },
  required: ['runId', 'fromPhase'],
  additionalProperties: false
} as const;

const V2_VALIDATE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    markdown: { type: 'string', minLength: 1 }
  },
  required: ['markdown'],
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
        nodeId: { type: 'string', minLength: 1 }
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
  const store = new CheckpointStore({ rootDir: opts.storeRoot ?? process.cwd() });

  const validateDsl: NativeToolDef = {
    tool: {
      name: 'validate_dsl',
      description: '校验 DSL YAML，仅检查 schema 与语义约束，不调用 Figma',
      inputSchema: YAML_INPUT_SCHEMA as unknown as Tool['inputSchema']
    },
    handler: async (args) => {
      try {
        const yaml = String(args?.yaml ?? '');
        const r = validate(yaml);
        return jsonResult(r);
      } catch (e) {
        return errorResult(ServerErrorCodes.INTERNAL_ERROR, (e as Error).message);
      }
    }
  };

  const dryRunLayout: NativeToolDef = {
    tool: {
      name: 'dry_run_layout',
      description: '运行解析 + 校验 + 布局规划，输出 plan 但不调用 Figma',
      inputSchema: YAML_INPUT_SCHEMA as unknown as Tool['inputSchema']
    },
    handler: async (args) => {
      try {
        const yaml = String(args?.yaml ?? '');
        const v = validate(yaml);
        if (!v.ok) return jsonResult({ ok: false, errors: v.errors });
        const planOut = plan(v.ir);
        return jsonResult({ ok: true, plan: planOut });
      } catch (e) {
        return errorResult(ServerErrorCodes.INTERNAL_ERROR, (e as Error).message);
      }
    }
  };

  const generateInteractionDoc: NativeToolDef = {
    tool: {
      name: 'generate_interaction_doc',
      description: '完整执行 7 phase 生成流程；中途失败会返回 lastPhase 以便 replay',
      inputSchema: GENERATE_INPUT_SCHEMA as unknown as Tool['inputSchema']
    },
    handler: async (args) => {
      try {
        if (!opts.backend) {
          return errorResult(
            ServerErrorCodes.EXECUTOR_BACKEND_UNAVAILABLE,
            'figma-console-mcp backend 未配置；本工具仅在引擎初始化时传入 backend 后可用',
            'validate_dsl 与 dry_run_layout 仍可使用'
          );
        }
        const yaml = String(args?.yaml ?? '');
        const runId =
          typeof args?.runId === 'string' && args.runId.length > 0
            ? args.runId
            : generateRunId();
        const executor = new Executor(opts.backend);
        await executor.ping();
        const result = await runPipeline({
          runId,
          yaml,
          store,
          executor
        });
        return jsonResult(result);
      } catch (e) {
        const err = e as Error & { code?: string };
        return errorResult(err.code ?? ServerErrorCodes.INTERNAL_ERROR, err.message);
      }
    }
  };

  const replayFromCheckpoint: NativeToolDef = {
    tool: {
      name: 'replay_from_checkpoint',
      description: '从指定 phase 重新执行，复用之前 phase 的 checkpoint',
      inputSchema: REPLAY_INPUT_SCHEMA as unknown as Tool['inputSchema']
    },
    handler: async (args) => {
      try {
        if (!opts.backend) {
          return errorResult(
            ServerErrorCodes.EXECUTOR_BACKEND_UNAVAILABLE,
            'figma-console-mcp backend 未配置'
          );
        }
        const runId = String(args?.runId ?? '');
        const fromPhase = Number(args?.fromPhase ?? 0);
        if (fromPhase < 1 || fromPhase > 7) {
          return errorResult(ServerErrorCodes.INVALID_INPUT, `fromPhase 必须 1..7，收到 ${fromPhase}`);
        }
        if (fromPhase > 1) store.validateChain(runId, fromPhase - 1);
        const phase1 = store.readByPhase(runId, 1);
        if (!phase1) {
          return errorResult('CHECKPOINT_NOT_FOUND', `runId=${runId} 不存在 phase 1`);
        }
        const executor = new Executor(opts.backend);
        await executor.ping();
        const result = await runPipeline({
          runId,
          yaml: '',
          store,
          executor,
          fromPhase
        });
        return jsonResult(result);
      } catch (e) {
        const err = e as Error & { code?: string };
        return errorResult(err.code ?? ServerErrorCodes.INTERNAL_ERROR, err.message);
      }
    }
  };

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
        'assetMap 形如 { "01": { type:"image", src:"..." }, "02": { type:"skip" } }；' +
        '缺省的章节按 skip 处理。',
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

  return [
    validateDsl,
    dryRunLayout,
    generateInteractionDoc,
    replayFromCheckpoint,
    validateV2Markdown,
    renderV2MarkdownTool
  ];
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

function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
