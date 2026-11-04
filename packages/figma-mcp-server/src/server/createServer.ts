/**
 * MCP Stdio Server entrypoint.
 *
 * Spec: openspec/changes/proxy-figma-console-tools-from-engine/specs/engine-mcp-server/spec.md
 *
 * Exposes a single MCP server that combines:
 *   - 5 native tools owned by figma-interaction-doc-engine itself:
 *       1. validate_v2_markdown         (no backend needed)
 *       2. render_v2_markdown_to_figma  (needs V2FigmaBackend)
 *       3. figma_probe_template         (needs V2FigmaBackend, read-only)
 *       4. figma_compile_template       (needs V2FigmaBackend, write-capable)
 *       5. get_skill_requirements       (no backend needed, read-only; drives SKILL.md Preflight)
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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { parseBadgeAnchors } from '../v2/badge-anchor.js';
import { checkPhase1Signoff } from '../v2/phase1-signoff.js';
import { ENGINE_VERSION, REQUIRED_SKILL_VERSION } from '../v2/version.js';

export { ENGINE_VERSION, REQUIRED_SKILL_VERSION };
import { getBridgeState } from './bridgeState.js';

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
// Version contract (served by get_skill_requirements)
// =========================================================================

/**
 * Minimum skill version this engine expects. Bump when a change in the engine
 * REQUIRES a matching change in the skill (new tool contract, new MCP field, etc.).
 *
 * 2.3.2: default style ships with role_annotation / wording frontmatter, SKILL.md
 *        gains Preflight calling get_skill_requirements. Engines older than 0.3.0
 *        do not expose this tool, so the Preflight gracefully falls back.
 * 2.4.0: Phase 1 完成声明门禁（validate_phase1_signoff）。
 *
 * 单一来源见 `v2/version.ts`：渲染返回体也带同一个版本号，用来判断「跑的是不是新 build」。
 */

// =========================================================================
// Native tool input schemas (raw JSON Schema, served verbatim to clients)
// =========================================================================

const PHASE1_SIGNOFF_JSON = {
  type: 'object',
  description:
    'Phase 1 需求挖掘完成声明（机器可验证）：unresolved_conflicts / pending_questions 必须是空数组，' +
    'dimensions 的 params / diff_areas / business / conflicts 必须都为 true。',
  properties: {
    schema_version: { type: 'number', enum: [1] },
    requirement: { type: 'string' },
    checked_at: { type: 'string' },
    unresolved_conflicts: { type: 'array' },
    pending_questions: { type: 'array' },
    dimensions: {
      type: 'object',
      properties: {
        params: { type: 'boolean' },
        diff_areas: { type: 'boolean' },
        business: { type: 'boolean' },
        conflicts: { type: 'boolean' }
      },
      required: ['params', 'diff_areas', 'business', 'conflicts'],
      additionalProperties: false
    },
    evidence: { type: 'object' }
  },
  required: ['schema_version', 'unresolved_conflicts', 'pending_questions', 'dimensions'],
  additionalProperties: true
} as const;

const V2_VALIDATE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    markdown: { type: 'string', minLength: 1 },
    /** 传了就校验：不合格直接 ok:false（Phase 1 硬门禁）。 */
    phase1Signoff: PHASE1_SIGNOFF_JSON
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
    badgeAnchors: {
      type: 'object',
      description:
        '标号锚点：键 "NN/C"（第 NN 章第 C 个簇，均从 1 起）。两种写法可混用：' +
        '① { text, offset?, occurrence? } —— 按主图内控件文本自动定位（首选，不用量坐标，主图换成实例也不失效）；' +
        '② { x, y } —— 主图归一化坐标（0–1，左上原点）。' +
        '文本找不到 → 退回模板网格并报 V2_W_BADGE_ANCHOR_TEXT_NOT_FOUND；某簇缺键 → 退回网格并报 V2_W_BADGE_ANCHOR_MISSING；' +
        '整表不传 → 全部按网格并报 V2_W_BADGE_ANCHOR_DEFAULTED（不再静默）；坐标越界夹取并报 V2_W_BADGE_ANCHOR_OUT_OF_RANGE。',
      additionalProperties: {
        anyOf: [
          {
            type: 'object',
            properties: {
              text: { type: 'string', minLength: 1, description: '主图内控件的文字（空白折叠、大小写不敏感）' },
              offset: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description: '相对命中文本左上角的像素偏移，如 [-24, -24]'
              },
              occurrence: { type: 'number', minimum: 1, description: '同名文本取第几个（1 起）' },
              note: { type: 'string' }
            },
            required: ['text'],
            additionalProperties: false
          },
          {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              note: { type: 'string' }
            },
            required: ['x', 'y'],
            additionalProperties: false
          }
        ]
      }
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
    forceReconcile: {
      type: 'boolean',
      description:
        '同步模式专用：显式接受「模板包缺失 / 指纹变化」，在旧文档上按 adopt 流程继续增量同步。' +
        'pack 缺失时跳过包相关能力（标号重排等）；指纹变化时按当前包同步，成功后重打指纹。' +
        '给 template.componentKey 时，pack 缺失会被视为隐式 adopt（跨文件唯一可靠寻址方式）。'
    },
    phase1Signoff: PHASE1_SIGNOFF_JSON,
    position: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
      additionalProperties: false
    },
    autoPlace: {
      type: 'string',
      enum: ['below', 'right'],
      description:
        '按目标页面现有内容自动摆放新文档（below = 最下沿 + rootGap；right = 最右沿 + rootGap）。' +
        '与 position 互斥，同时给时以 position 为准。需要 target.pageId。'
    },
    screenshot: {
      type: 'boolean',
      description:
        '渲染成功后自动导出整篇截图（默认 true）。`summary` 只说几章几簇，' +
        '白块占位 / 标题压字 / 区块标题丢失这些只有看图才发现，所以默认强制出图。'
    },
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

const SKILL_REQUIREMENTS_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
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
        if (args?.phase1Signoff !== undefined) {
          const signoff = checkPhase1Signoff(args.phase1Signoff);
          if (!signoff.ok) {
            return jsonResult({
              ...r,
              ok: false,
              errors: [...r.errors, ...signoff.errors],
              warnings: [...r.warnings, ...signoff.warnings],
              phase1Signoff: { ok: false, errors: signoff.errors }
            });
          }
          return jsonResult({ ...r, phase1Signoff: { ok: true, warnings: signoff.warnings } });
        }
        return jsonResult(r);
      } catch (e) {
        return errorResult(ServerErrorCodes.INTERNAL_ERROR, (e as Error).message);
      }
    }
  };

  /**
   * Phase 1 完成声明校验（S4 的机器可验证门禁）。
   *
   * 两个入口：直接给对象（skill 拼好传上来），或给文件路径 / 缺省读
   * `<cwd>/.interaction-sop/phase1-signoff.json`。只读，不碰 Figma。
   */
  const validatePhase1SignoffTool: NativeToolDef = {
    tool: {
      name: 'validate_phase1_signoff',
      description:
        '校验 Phase 1 需求挖掘完成声明。规则：schema_version=1、unresolved_conflicts=[]、' +
        'pending_questions=[]、dimensions 的 params/diff_areas/business/conflicts 全为 true。' +
        '传 signoff 对象则直接校验；传 path 则读该 JSON；都不传读 `<cwd>/.interaction-sop/phase1-signoff.json`。' +
        '返回 ok/errors/warnings/path。Phase 2 入口必须先拿到 ok:true 才能写 Markdown。',
      inputSchema: {
        type: 'object',
        properties: {
          signoff: PHASE1_SIGNOFF_JSON,
          path: { type: 'string' }
        },
        additionalProperties: false
      } as unknown as Tool['inputSchema']
    },
    handler: async (args) => {
      try {
        let raw = args?.signoff;
        const path =
          typeof args?.path === 'string' && args.path.trim() !== ''
            ? args.path
            : join(process.cwd(), '.interaction-sop', 'phase1-signoff.json');
        let source = 'inline';
        if (raw === undefined) {
          source = path;
          try {
            raw = JSON.parse(readFileSync(path, 'utf8'));
          } catch (e) {
            return jsonResult({
              ok: false,
              source,
              errors: [
                {
                  code: 'V2_SIGNOFF_FILE_MISSING',
                  message:
                    `读不到 Phase 1 完成声明 ${path}：${(e as Error).message}。` +
                    '按 skill phase1-analysis.md 的模板落盘后再试。'
                }
              ],
              warnings: []
            });
          }
        }
        const checked = checkPhase1Signoff(raw);
        return jsonResult({ ...checked, source });
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
        'template 三种寻址，优先级：template.componentKey（团队库已发布组件，**跨文件唯一可靠方式**，推荐）> ' +
        '{fileKey,nodeId}（同文件模式：fileKey 必须等于 target.fileKey；跨文件会明确报 V2_TEMPLATE_OTHER_FILE / V2_TEMPLATE_FILE_UNREACHABLE，不会回落成「在目标文件里找 1:14」）' +
        '> FIGMA_TEMPLATE_FILE_KEY/NODE_ID > ~/.game-interaction-sop/template.json > 官方默认。' +
        '只传 template.fileKey 不传 target.fileKey 时，按模板文件定向写入并告警 V2_W_TARGET_FROM_TEMPLATE（旧行为是写进活动文件）。' +
        'componentKey 可用时返回体不带 packMissing/packCandidates。' +
        'Markdown 里的 `- @策划：…` 条目会渲染成「职能标记」组件实例。' +
        '两种配置（优先用前者）：① roleBlock.variantKeys = {角色: 已发布变体 key} —— 跨库唯一可用方式，经 importComponentByKeyAsync 导入；' +
        '② roleBlock.componentSetId = 组件集 nodeId —— 只在渲染目标文件内解析，跨库会报 V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE。' +
        '变体命名须为 `职能标记=<角色>`（允许 `#` 前缀）；变体内需有一个名为 `文本` 的标签 TEXT，正文写入另一个 TEXT。' +
        '缺角色时报 V2_ROLE_BLOCK_UNAVAILABLE（details 含 missingRoles），且在克隆模板前返回。' +
        'assetMap 两类键：' +
        '① "NN" = 第 NN 章主图，值为 image / figma_node / skip，缺省按 skip；' +
        '② "NN/C/K" = 第 NN 章第 C 簇的第 K 张配图（C、K 从 1 起；K 按该簇全部「配图：」bullet 的文档顺序计，跨 #### 连续不重置），值为 figma_node / skip。' +
        'figma_node 可带 crop:{x,y,width,height}（相对源节点左上角）裁出局部，配图占位按裁出区域的宽高比定高（宽度上限为说明栏宽，小图不放大）。' +
        '源节点必须在渲染目标文件内。' +
        '例：{ "01": { type:"figma_node", fileKey:"…", nodeId:"588:6399" }, "01/1/2": { type:"figma_node", fileKey:"…", nodeId:"588:6399", crop:{ x:700, y:0, width:520, height:160 } } }。' +
        '匹配不到的键与单张配图失败均为软告警，不中断渲染。' +
        'badgeAnchors 可选：图上标号的位置。键 "NN/C"（章/簇，1 起）。首选文本锚点：' +
        '{ "01/2": { "text": "Click to input", "offset": [-24,-24] } } —— 引擎在主图子树里按控件文本找，' +
        '摆放前读 absoluteBoundingBox 换算（主图换成 figma_instance 后不会失效，不需要重算坐标）。' +
        '也可用坐标锚点 {x,y}：主图归一化 0–1，左上原点，贴控件左上再往上偏 10–20px，别取控件正中。' +
        '整表不传 = 全部按模板网格并返回 V2_W_BADGE_ANCHOR_DEFAULTED（不再静默）；' +
        '传了表但某簇缺键 → 退回网格 + V2_W_BADGE_ANCHOR_MISSING；文本找不到 → 退回网格 + V2_W_BADGE_ANCHOR_TEXT_NOT_FOUND；' +
        '命中多个同名文本时取第 1 个并报 V2_W_BADGE_ANCHOR_TEXT_AMBIGUOUS（用 occurrence 指定）。' +
        '例：{ "01/2": { "text": "Click to input", "offset": [-24, -24] } }。' +
        '【配置对账】返回体带 resolvedRoleBlock{mode,source,componentSetId,variantPrefix,labelTextName,roles}、configPath、enginePid；' +
        'enginePid 每次不同 = 有多个引擎进程在接请求。' +
        '【同步模式】文档已渲染过、需要再次写入时，传 target.rootId（上次返回的 rootInstanceId）：' +
        '引擎不新建文档，而是逐条比对后只改有变化的地方；设计师手改的文字、手贴的图、拖过的气泡一律保留，' +
        '双方都改过的条目不覆盖，列在 conflicts 里；返回 changes / conflicts / preserved。' +
        'scope:"NN" 或 "NN/C" 只同步一个界面或一个簇；dryRun:true 只返回计划不写画布。' +
        '只比对文字，不比对样式。scope / dryRun 只能和 rootId 一起用。' +
        '返回体带 bubbles（逐章气泡清单：section/cluster/nodeId）与 figureSlots（配图槽 path/title/nodeId）——' +
        'create 与 reconcile 都有；reconcile 是从画布读的，顺带核对数量（不符报 V2_W_BADGE_COUNT_MISMATCH）。' +
        '返回体还带 engineVersion / runId：报错文案与版本对不上时，先确认跑的是不是新 build（旧 dist / 旧 worker）。' +
        '【模板包可观测】返回体带 pack{path,origin,project,components,capabilities} 说明本次用了哪个模板包；' +
        'create 没找到时给 packMissing:true + packCandidates（4 个候选路径及各自 missing/invalid/incomplete 原因）；' +
        '库引用模式（componentKey）与同步模式不返回这两块（同步只看 pack 命中与否，缺包由 V2_W_PACK_ADOPTED / V2_W_RECONCILE_NO_CREATE 解释）。' +
        '传了 template.fileKey/nodeId 但已命中模板包时，这两个字段不参与决策，返回软告警 V2_W_TEMPLATE_ARG_IGNORED。' +
        '【同步 adopt】旧文档由 pack 渲染、现在 pack 没了或指纹变了，默认拒绝（V2_PACK_MISMATCH）。' +
        '传 template.componentKey 或 forceReconcile:true 可继续增量同步；指纹变化时成功后自动重打指纹（V2_W_PACK_ADOPTED）。' +
        'adopt 且没有模板包时不能新建节点：需要新增的界面/簇/条目列在 conflicts（kind: needs-new-node），' +
        '其余改动照常写入，并返回 V2_W_RECONCILE_NO_CREATE——dryRun 与真跑结论一致，不会一边通过一边炸。' +
        '写操作超时 / 断连时返回体带 runId 与 sideEffects（已确认落地的 changes），同参数重跑是幂等的（V2_W_WRITE_TIMEOUT_RECONCILED）。',
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
            ...(parseBadgeAnchors(args?.badgeAnchors)
              ? { badgeAnchors: parseBadgeAnchors(args?.badgeAnchors) }
              : {}),
            target,
            scope: args?.scope as string | undefined,
            dryRun: args?.dryRun as boolean | undefined,
            forceReconcile: args?.forceReconcile as boolean | undefined,
            phase1Signoff: args?.phase1Signoff,
            position: args?.position as { x: number; y: number } | undefined,
            autoPlace: args?.autoPlace as 'below' | 'right' | undefined,
            template: args?.template as { fileKey?: string; nodeId?: string; componentKey?: string } | undefined
          },
          opts.v2Backend
        );

        // 渲染成功就默认出图：数字说「成功」，画面可能一塌糊涂（这一轮踩过
        // 白块占位、标题压字、区块标题丢失），验收必须看图。
        const rootId = result.ok ? (result.rootInstanceId ?? target?.rootId) : undefined;
        if (rootId && args?.screenshot !== false && typeof opts.v2Backend.exportNodeImage === 'function') {
          try {
            const shot = await opts.v2Backend.exportNodeImage(rootId, 1568);
            return {
              content: [
                { type: 'image' as const, data: shot.base64, mimeType: 'image/png' },
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    { ...result, screenshot: { width: shot.width, height: shot.height } },
                    null,
                    2
                  )
                }
              ]
            };
          } catch (e) {
            // 出图失败不影响渲染结果本身，退化成原来的 JSON。
            result.warnings.push({
              code: 'V2_W_SCREENSHOT_FAILED',
              message: `渲染成功但截图失败：${(e as Error).message}——请手动在 Figma 里看一眼`
            });
          }
        }
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
            description:
              '_staging 页上人工粘好的部件节点 id。chapterTitle / topBanner / topIntro 是拆分在部件之外的块（标题、banner、文档说明），合并后方块才完整',
            properties: {
              top: { type: 'string' },
              topBanner: { type: 'string' },
              topIntro: { type: 'string' },
              chapter: { type: 'string' },
              chapterTitle: { type: 'string' },
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
          docBackground: {
            type: 'string',
            description:
              '文档底色 #rrggbb（模板身份）。深色稿（蛋仔 #232429）在白色画布上整篇文字看不清，' +
              '渲染时根帧用这个颜色；不传则白底'
          },
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
          ...(typeof args?.docBackground === 'string' ? { docBackground: args.docBackground } : {}),
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

  const getSkillRequirementsTool: NativeToolDef = {
    tool: {
      name: 'get_skill_requirements',
      description:
        '【只读，不调 Figma】返回本引擎要求的最低 skill 版本和自身引擎版本。' +
        'SKILL.md Preflight 在会话开场调用此工具，比对本地安装的 skill manifest.json 版本号，' +
        '低于 requiredSkillVersion 时提示用户升级（软警告，不阻断）。' +
        '返回：{ requiredSkillVersion: string, engineVersion: string, bridge?: { port, preferredPort, fallback, holderPid, enginePid, supervisorPid } }。' +
        'bridge.fallback=true 表示子进程退到了备用端口（render 会报 Cannot connect，代理工具仍正常）；' +
        'enginePid 每次渲染都变说明有多个引擎进程在接请求。' +
        '引擎 < 0.3.0 不提供此工具，Preflight 会收到 TOOL_NOT_FOUND 并退化为"引擎版本较旧"的提示。',
      inputSchema: SKILL_REQUIREMENTS_INPUT_SCHEMA as unknown as Tool['inputSchema']
    },
    handler: async () => {
      try {
        const bridge =
          process.env.FIGMA_BACKEND === 'figma-console' ? getBridgeState() : undefined;
        return jsonResult({
          requiredSkillVersion: REQUIRED_SKILL_VERSION,
          engineVersion: ENGINE_VERSION,
          // 验收方靠这一段判断「测的是不是新进程 / 桥有没有掉到备用端口」：
          // enginePid 每次渲染都变说明有多个引擎在接请求；fallback=true 时
          // render 必报 Cannot connect，而代理工具仍然正常。
          ...(bridge ? { bridge } : {})
        });
      } catch (e) {
        return errorResult(ServerErrorCodes.INTERNAL_ERROR, (e as Error).message);
      }
    }
  };

  return [
    validateV2Markdown,
    renderV2MarkdownTool,
    validatePhase1SignoffTool,
    probeTemplateTool,
    compileTemplateTool,
    getSkillRequirementsTool
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
