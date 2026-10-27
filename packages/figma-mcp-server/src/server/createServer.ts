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
  compileTemplate,
  parseV2,
  probeTemplate,
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
        type: { const: 'figma_instance' },
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
        pageId: { type: 'string' },
        rootId: { type: 'string' }
      },
      additionalProperties: false
    },
    scope: { type: 'string', pattern: '^\\d{2}(/\\d+)?$' },
    dryRun: { type: 'boolean' },
    template: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', minLength: 1 },
        nodeId: { type: 'string', minLength: 1 },
        componentKey: { type: 'string', minLength: 1 }
      },
      additionalProperties: false
    }
  },
  required: ['markdown'],
  additionalProperties: false
} as const;

const V2_PROBE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    nodeId: { type: 'string', minLength: 1 },
    fileKey: { type: 'string', minLength: 1 },
    maxNodes: { type: 'number', exclusiveMinimum: 0 }
  },
  required: ['nodeId'],
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
        '把 v2 Markdown 写入 Figma 模板。需要在 createServer 时传入 v2Backend。' +
        'template 可选：{fileKey,nodeId} 覆盖模板地址（优先级：入参 > FIGMA_TEMPLATE_FILE_KEY/NODE_ID > ~/.game-interaction-sop/template.json > 官方默认）。' +
        'Markdown 里的 `- @策划：…` 条目会渲染成「职能标记」组件实例，组件集由配置 roleBlock.componentSetId 指定，缺失时报 V2_ROLE_BLOCK_UNAVAILABLE。' +
        'assetMap 两类键：' +
        '① "NN" = 第 NN 章主图，值为 image / figma_node / skip，缺省按 skip；' +
        '② "NN/C/K" = 第 NN 章第 C 簇的第 K 张配图（C、K 从 1 起；K 按该簇全部「配图：」bullet 的文档顺序计，跨 #### 连续不重置），值为 figma_node / skip。' +
        'figma_node 可带 crop:{x,y,width,height}（相对源节点左上角）裁出局部，配图占位按裁出区域的宽高比定高（宽度上限为说明栏宽，小图不放大）。' +
        '源节点必须在渲染目标文件内。' +
        '例：{ "01": { type:"figma_node", fileKey:"…", nodeId:"588:6399" }, "01/1/2": { type:"figma_node", fileKey:"…", nodeId:"588:6399", crop:{ x:700, y:0, width:520, height:160 } } }。' +
        '匹配不到的键与单张配图失败均为软告警，不中断渲染。' +
        '【同步模式】文档已渲染过、需要再次写入时，传 target.rootId（上次返回的 rootInstanceId）：' +
        '引擎不新建文档，而是逐条比对后只改有变化的地方；设计师手改的文字、手贴的图、拖过的气泡一律保留，' +
        '双方都改过的条目不覆盖，列在 conflicts 里；返回 changes / conflicts / preserved。' +
        'scope:"NN" 或 "NN/C" 只同步一个界面或一个簇；dryRun:true 只返回计划不写画布。' +
        '只比对文字，不比对样式。scope / dryRun 只能和 rootId 一起用。',
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
        const target = args?.target as { fileKey?: string; pageId?: string; rootId?: string } | undefined;
        const syncError = findInvalidSyncArgs(target?.rootId, args?.scope, args?.dryRun);
        if (syncError) {
          return errorResult(ServerErrorCodes.INVALID_INPUT, syncError);
        }
        const result = await renderV2MarkdownToFigma(
          {
            markdown,
            assetMap,
            target,
            scope: args?.scope as string | undefined,
            dryRun: args?.dryRun as boolean | undefined,
            template: args?.template as { fileKey?: string; nodeId?: string } | undefined
          },
          opts.v2Backend
        );
        return jsonResult(result);
      } catch (e) {
        const err = e as Error & { code?: string };
        return errorResult(err.code ?? ServerErrorCodes.INTERNAL_ERROR, err.message);
      }
    }
  };

  const probeTemplateTool: NativeToolDef = {
    tool: {
      name: 'figma_probe_template',
      description:
        '【只读，不修改文件】体检一个项目模板：判断骨架六条铁律、找出章节/簇母版、判定 8 项能力、' +
        '输出缺口清单与 template.json 草案（components 为 null，编译发布后回填）+ 结构指纹。' +
        '结论三态：ready（可接，0 改造）/ needs-anchor（可接，需补或确认锚点）/ non-conformant（铁律不满足，不能接）。' +
        'nodeId 传模板根节点；fileKey 缺省为当前连接文件。每条能力都带 source：probed（实测）/ inferred（推断）/ default（按契约缺省），' +
        'inferred 与 default 必须人工确认后才能用于编译。',
      inputSchema: V2_PROBE_INPUT_SCHEMA as unknown as Tool['inputSchema']
    },
    handler: async (args) => {
      try {
        if (!opts.v2Backend) {
          return errorResult(
            ServerErrorCodes.V2_BACKEND_UNAVAILABLE,
            'v2Backend 未配置；本工具需要在 createServer({ v2Backend }) 初始化时传入。'
          );
        }
        const nodeId = String(args?.nodeId ?? '').trim();
        if (!nodeId) {
          return errorResult(ServerErrorCodes.INVALID_INPUT, 'nodeId 必填：传模板根节点 id');
        }
        const fileKey = typeof args?.fileKey === 'string' ? args.fileKey : undefined;
        const maxNodes = typeof args?.maxNodes === 'number' ? args.maxNodes : undefined;
        const report = await probeTemplate({
          nodeId,
          ...(fileKey ? { fileKey } : {}),
          ...(maxNodes ? { maxNodes } : {}),
          backend: opts.v2Backend
        });
        return jsonResult(report);
      } catch (e) {
        const err = e as Error & { code?: string };
        return errorResult(err.code ?? ServerErrorCodes.INTERNAL_ERROR, err.message);
      }
    }
  };

  const compileTemplateTool: NativeToolDef = {
    tool: {
      name: 'figma_compile_template',
      description:
        '【会写入库文件，需 write: true】把一个项目模板编译成我们自己库文件里的 4 个原子组件' +
        '（顶部 / 章节 / 簇 / 结尾，结尾可选）：克隆人工粘到 _staging 页的部件 → 字体统一为 Noto Sans SC' +
        ' → 补标号容器（按 1:14 形态）→ 收编嵌套零件为自有组件（变体集重建）→ 对产物重算能力。' +
        '项目源模板全程只读。Figma 没有发布 API，所以发布要人工在 Assets 面板点一次，' +
        '然后用 phase=verify 做真实 import 冒烟并回填组件 key。write 缺省 false = 干跑，只出计划与缺口。',
      inputSchema: {
        type: 'object',
        properties: {
          phase: { type: 'string', enum: ['compile', 'verify', 'contract'] },
          project: { type: 'string', description: '项目名，用于组件命名 <项目> / 顶部' },
          source: {
            type: 'object',
            properties: {
              fileKey: { type: 'string' },
              nodeId: { type: 'string', description: '项目模板根节点 id' }
            },
            required: ['nodeId']
          },
          library: {
            type: 'object',
            properties: {
              fileKey: { type: 'string' },
              pageId: { type: 'string', description: '库文件里放组件的页面 id' }
            },
            required: ['fileKey', 'pageId']
          },
          staged: {
            type: 'object',
            description: '_staging 页上人工粘好的部件节点 id',
            properties: {
              top: { type: 'string' },
              chapter: { type: 'string' },
              cluster: { type: 'string' },
              footer: { type: 'string' }
            }
          },
          partsPageId: { type: 'string', description: '收编出来的零件落脚的页面 id' },
          capabilities: {
            type: 'object',
            description: '源模板探针给出的 8 项能力；不给则按契约缺省，差异对比会失真'
          },
          expectedFingerprint: { type: 'string', description: '探针阶段记录的源模板指纹（漂移检查）' },
          actualFingerprint: { type: 'string', description: '当前源模板指纹（由调用方先探一次）' },
          expectedMasters: {
            type: 'object',
            description: '探针给出的母版名与尺寸，用于进门检查；缺省则跳过尺寸核对'
          },
          verifyFileKey: {
            type: 'string',
            description:
              'phase=verify 时在哪个文件里做 import 冒烟。建议固定用一个空沙盒文件：' +
              '在源项目文件里跑可能因组件依赖成环而挂死；在库文件本身跑则永远成功、测不出问题'
          },
          badgeContainerSourceId: { type: 'string', description: '散落标号模板用来补容器的 1:14 气泡节点 id' },
          components: {
            type: 'object',
            description: 'phase=verify 时传入编译产出的 4 个 key',
            properties: {
              top: { type: 'string' },
              chapter: { type: 'string' },
              cluster: { type: 'string' },
              footer: { type: 'string' }
            }
          },
          write: { type: 'boolean', description: '缺省 false（干跑）；true 才写入库文件' }
        },
        required: ['phase', 'project', 'source', 'library']
      }
    },
    handler: async (args) => {
      try {
        if (!opts.v2Backend) {
          return errorResult(
            ServerErrorCodes.V2_BACKEND_UNAVAILABLE,
            'v2Backend 未配置；本工具需要在 createServer({ v2Backend }) 初始化时传入。'
          );
        }
        const phase =
          args?.phase === 'verify' ? 'verify' : args?.phase === 'contract' ? 'contract' : 'compile';
        const nodeId = String((args?.source as { nodeId?: string })?.nodeId ?? '').trim();
        const library = args?.library as { fileKey?: string; pageId?: string } | undefined;
        if (phase !== 'contract' && (!nodeId || !library?.fileKey || !library?.pageId)) {
          return errorResult(
            ServerErrorCodes.INVALID_INPUT,
            'source.nodeId / library.fileKey / library.pageId 均为必填'
          );
        }
        // 编译全程只写库文件；verify 的 import 冒烟必须落在**非库文件**
        // （同文件取自己永远成功，测不出是否真的发布过）。
        const sourceFileKey =
          typeof (args?.source as { fileKey?: string })?.fileKey === 'string'
            ? (args!.source as { fileKey: string }).fileKey
            : undefined;
        const verifyFileKey =
          typeof args?.verifyFileKey === 'string' ? args.verifyFileKey : undefined;
        const targetFileKey =
          phase === 'verify'
            ? (verifyFileKey ?? sourceFileKey ?? library?.fileKey)
            : phase === 'contract'
              ? undefined
              : library?.fileKey;
        const bound =
          targetFileKey && typeof opts.v2Backend.withFileKey === 'function'
            ? opts.v2Backend.withFileKey(targetFileKey)
            : opts.v2Backend;

        const report = await compileTemplate({
          phase,
          project: String(args?.project ?? '').trim(),
          source: {
            nodeId,
            ...(sourceFileKey ? { fileKey: sourceFileKey } : {})
          },
          library: { fileKey: library?.fileKey ?? '', pageId: library?.pageId ?? '' },
          ...(args?.staged ? { staged: args.staged as never } : {}),
          ...(args?.capabilities ? { capabilities: args.capabilities as never } : {}),
          ...(args?.expectedMasters ? { expectedMasters: args.expectedMasters as never } : {}),
          ...(typeof args?.expectedFingerprint === 'string'
            ? { expectedFingerprint: args.expectedFingerprint }
            : {}),
          ...(typeof args?.actualFingerprint === 'string'
            ? { actualFingerprint: args.actualFingerprint }
            : {}),
          ...(typeof args?.partsPageId === 'string' ? { partsPageId: args.partsPageId } : {}),
          ...(typeof args?.badgeContainerSourceId === 'string'
            ? { badgeContainerSourceId: args.badgeContainerSourceId }
            : {}),
          ...(args?.components ? { components: args.components as never } : {}),
          write: args?.write === true,
          backend: bound
        });
        return jsonResult(report);
      } catch (e) {
        const err = e as Error & { code?: string };
        return errorResult(err.code ?? ServerErrorCodes.INTERNAL_ERROR, err.message);
      }
    }
  };

  return [validateV2Markdown, renderV2MarkdownTool, probeTemplateTool, compileTemplateTool];
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

/** `scope` / `dryRun` only make sense when syncing an existing document. */
function findInvalidSyncArgs(rootId: unknown, scope: unknown, dryRun: unknown): string | undefined {
  if (rootId !== undefined && (typeof rootId !== 'string' || rootId === '')) {
    return 'target.rootId must be a non-empty node id';
  }
  if (scope !== undefined && (typeof scope !== 'string' || !/^\d{2}(\/\d+)?$/.test(scope))) {
    return 'scope must look like "03" (a section) or "03/2" (a cluster)';
  }
  if (dryRun !== undefined && typeof dryRun !== 'boolean') {
    return 'dryRun must be a boolean';
  }
  if (rootId === undefined && (scope !== undefined || dryRun !== undefined)) {
    return 'scope / dryRun only apply when syncing an existing document: pass target.rootId';
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
