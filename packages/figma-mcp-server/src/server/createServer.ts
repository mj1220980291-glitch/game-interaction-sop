/**
 * MCP Stdio Server entrypoint.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/engine-mcp-server/spec.md
 *
 * Exposes 4 tools:
 *   - validate_dsl
 *   - dry_run_layout
 *   - generate_interaction_doc
 *   - replay_from_checkpoint
 *
 * The actual figma backend is wired by the caller — we don't have a built-in
 * client to figma-console-mcp because the engine can run standalone for
 * validate/dry-run. `createServer({ backend })` accepts an optional
 * FigmaExecuteBackend; without one, `generate_interaction_doc` returns
 * EXECUTOR_BACKEND_UNAVAILABLE.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

export interface CreateServerOptions {
  backend?: FigmaExecuteBackend;
  /**
   * v2 backend implementing the new high-level Figma operations
   * (clone, set-text, delete, reparent, etc.). Required for
   * `render_v2_markdown_to_figma`. Independent from the legacy v0.1
   * `backend` (figma_execute scripted style).
   */
  v2Backend?: V2FigmaBackend;
  /** Override CheckpointStore root (default: process.cwd()). */
  storeRoot?: string;
  /** Server name for MCP identification. Defaults to 'figma-interaction-doc-engine'. */
  name?: string;
  /** Server version. Defaults to package version. */
  version?: string;
}

export const ServerErrorCodes = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  EXECUTOR_BACKEND_UNAVAILABLE: 'EXECUTOR_BACKEND_UNAVAILABLE',
  V2_BACKEND_UNAVAILABLE: 'V2_BACKEND_UNAVAILABLE'
} as const;

const VALIDATE_INPUT = { yaml: z.string().min(1) };
const DRY_RUN_INPUT = { yaml: z.string().min(1) };
const GENERATE_INPUT = {
  yaml: z.string().min(1),
  runId: z.string().optional()
};
const REPLAY_INPUT = {
  runId: z.string().min(1),
  fromPhase: z.number().int().min(1).max(7)
};

// ---- v2 schemas ---------------------------------------------------------

const V2_VALIDATE_INPUT = { markdown: z.string().min(1) };

const V2_ASSET_SPEC = z.discriminatedUnion('type', [
  z.object({ type: z.literal('image'), src: z.string().min(1) }),
  z.object({
    type: z.literal('figma_node'),
    fileKey: z.string().min(1),
    nodeId: z.string().min(1)
  }),
  z.object({ type: z.literal('skip') })
]);

const V2_RENDER_INPUT = {
  markdown: z.string().min(1),
  assetMap: z.record(z.string(), V2_ASSET_SPEC).optional(),
  target: z
    .object({
      fileKey: z.string().optional(),
      pageId: z.string().optional()
    })
    .optional()
};

/** Build a server instance. Caller must `.connect(transport)` to start. */
export function createServer(opts: CreateServerOptions = {}): McpServer {
  const server = new McpServer({
    name: opts.name ?? 'figma-interaction-doc-engine',
    version: opts.version ?? '0.1.0'
  });

  const store = new CheckpointStore({ rootDir: opts.storeRoot ?? process.cwd() });

  // ---- validate_dsl -----------------------------------------------------
  server.registerTool(
    'validate_dsl',
    {
      description: '校验 DSL YAML，仅检查 schema 与语义约束，不调用 Figma',
      inputSchema: VALIDATE_INPUT
    },
    async ({ yaml }) => {
      try {
        const r = validate(yaml);
        return jsonResult(r);
      } catch (e) {
        return errorResult(ServerErrorCodes.INTERNAL_ERROR, (e as Error).message);
      }
    }
  );

  // ---- dry_run_layout ---------------------------------------------------
  server.registerTool(
    'dry_run_layout',
    {
      description: '运行解析 + 校验 + 布局规划，输出 plan 但不调用 Figma',
      inputSchema: DRY_RUN_INPUT
    },
    async ({ yaml }) => {
      try {
        const v = validate(yaml);
        if (!v.ok) return jsonResult({ ok: false, errors: v.errors });
        const planOut = plan(v.ir);
        return jsonResult({ ok: true, plan: planOut });
      } catch (e) {
        return errorResult(ServerErrorCodes.INTERNAL_ERROR, (e as Error).message);
      }
    }
  );

  // ---- generate_interaction_doc ----------------------------------------
  server.registerTool(
    'generate_interaction_doc',
    {
      description: '完整执行 7 phase 生成流程；中途失败会返回 lastPhase 以便 replay',
      inputSchema: GENERATE_INPUT
    },
    async ({ yaml, runId }) => {
      try {
        if (!opts.backend) {
          return errorResult(
            ServerErrorCodes.EXECUTOR_BACKEND_UNAVAILABLE,
            'figma-console-mcp backend 未配置；本工具仅在引擎初始化时传入 backend 后可用',
            'validate_dsl 与 dry_run_layout 仍可使用'
          );
        }
        const executor = new Executor(opts.backend);
        await executor.ping();
        const id = runId ?? generateRunId();
        const result = await runPipeline({
          runId: id,
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
  );

  // ---- replay_from_checkpoint ------------------------------------------
  server.registerTool(
    'replay_from_checkpoint',
    {
      description: '从指定 phase 重新执行，复用之前 phase 的 checkpoint',
      inputSchema: REPLAY_INPUT
    },
    async ({ runId, fromPhase }) => {
      try {
        if (!opts.backend) {
          return errorResult(
            ServerErrorCodes.EXECUTOR_BACKEND_UNAVAILABLE,
            'figma-console-mcp backend 未配置'
          );
        }
        // Validate the chain up to fromPhase-1 before replaying.
        if (fromPhase > 1) store.validateChain(runId, fromPhase - 1);
        const phase1 = store.readByPhase(runId, 1);
        if (!phase1) {
          return errorResult('CHECKPOINT_NOT_FOUND', `runId=${runId} 不存在 phase 1`);
        }
        const executor = new Executor(opts.backend);
        await executor.ping();
        // Reconstruct the original yaml from phase-1 input is intentionally
        // skipped — we replay using the cached IR via fromPhase. The pipeline
        // will read phase-1 payload if fromPhase > 1.
        const result = await runPipeline({
          runId,
          yaml: '', // ignored when fromPhase > 1
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
  );

  // ---- validate_v2_markdown (v0.2) -------------------------------------
  server.registerTool(
    'validate_v2_markdown',
    {
      description:
        '校验 v2 Markdown 是否通过强校验。不调用 Figma。返回 ok/errors/warnings/ir。',
      inputSchema: V2_VALIDATE_INPUT
    },
    async ({ markdown }) => {
      try {
        const r = parseV2(markdown);
        return jsonResult(r);
      } catch (e) {
        return errorResult(ServerErrorCodes.INTERNAL_ERROR, (e as Error).message);
      }
    }
  );

  // ---- render_v2_markdown_to_figma (v0.2) ------------------------------
  server.registerTool(
    'render_v2_markdown_to_figma',
    {
      description:
        '把 v2 Markdown 写入 Figma 模板 1:14。需要在 createServer 时传入 v2Backend。' +
        'assetMap 形如 { "01": { type:"image", src:"..." }, "02": { type:"skip" } }；' +
        '缺省的章节按 skip 处理。',
      inputSchema: V2_RENDER_INPUT
    },
    async ({ markdown, assetMap, target }) => {
      try {
        if (!opts.v2Backend) {
          return errorResult(
            ServerErrorCodes.V2_BACKEND_UNAVAILABLE,
            'v2Backend 未配置；本工具需要在 createServer({ v2Backend }) 初始化时传入。',
            'validate_v2_markdown 仍可用。'
          );
        }
        const result = await renderV2MarkdownToFigma(
          {
            markdown,
            assetMap: assetMap as Record<string, AssetSpec> | undefined,
            target
          },
          opts.v2Backend
        );
        return jsonResult(result);
      } catch (e) {
        const err = e as Error & { code?: string };
        return errorResult(err.code ?? ServerErrorCodes.INTERNAL_ERROR, err.message);
      }
    }
  );

  return server;
}

// ---- response helpers --------------------------------------------------

function jsonResult(obj: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(obj, null, 2)
      }
    ]
  };
}

function errorResult(code: string, message: string, hint?: string) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ code, message, ...(hint ? { hint } : {}) }, null, 2)
      }
    ]
  };
}

function generateRunId(): string {
  const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}
