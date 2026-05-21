/**
 * Executor: thin wrapper around figma_execute that ONLY runs code produced by
 * our internal template registry. There is no `runRaw` method by design —
 * external strings can never reach the Figma sandbox.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 */

import {
  buildTemplate,
  TEMPLATE_NAMES,
  type TemplateName,
  type TemplateParamMap
} from '../templates/index.js';
import type {
  ExecuteResponse,
  FigmaExecuteBackend,
  StatusResponse
} from './backend.js';

export const ExecutorErrorCodes = {
  EXECUTOR_BACKEND_UNAVAILABLE: 'EXECUTOR_BACKEND_UNAVAILABLE',
  EXECUTOR_TEMPLATE_UNKNOWN: 'EXECUTOR_TEMPLATE_UNKNOWN',
  EXECUTOR_BACKEND_ERROR: 'EXECUTOR_BACKEND_ERROR'
} as const;
export type ExecutorErrorCode =
  (typeof ExecutorErrorCodes)[keyof typeof ExecutorErrorCodes];

export class ExecutorError extends Error {
  constructor(
    public readonly code: ExecutorErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ExecutorError';
  }
}

export interface ExecutionLogEntry<K extends TemplateName = TemplateName> {
  template: K;
  params: TemplateParamMap[K];
  result: unknown;
  ms: number;
  warning?: string;
}

export interface ExecutorOptions {
  /** Default per-call timeout (ms), forwarded to figma_execute. */
  defaultTimeout?: number;
}

/**
 * Concrete executor. Construct one per generation run so the `executions`
 * log stays attached to that run.
 */
export class Executor {
  public readonly executions: ExecutionLogEntry[] = [];
  private healthChecked = false;
  private healthOk = false;

  constructor(
    private readonly backend: FigmaExecuteBackend,
    private readonly options: ExecutorOptions = {}
  ) {}

  /** Public — triggers status() exactly once and caches the result. */
  async ping(): Promise<StatusResponse> {
    if (this.healthChecked) {
      return { ok: this.healthOk };
    }
    this.healthChecked = true;
    try {
      const s = await this.backend.status();
      this.healthOk = !!s.ok;
      return s;
    } catch (e) {
      this.healthOk = false;
      throw new ExecutorError(
        ExecutorErrorCodes.EXECUTOR_BACKEND_UNAVAILABLE,
        '无法连接 figma-console-mcp，请确认其已启动并已通过 Desktop Bridge 插件连接 Figma',
        e
      );
    }
  }

  /**
   * Run a named template with params. The only entrypoint that talks to
   * the backend. Refuses unknown template names.
   */
  async run<K extends TemplateName>(
    name: K,
    params: TemplateParamMap[K]
  ): Promise<unknown> {
    if (!(TEMPLATE_NAMES as readonly string[]).includes(name)) {
      throw new ExecutorError(
        ExecutorErrorCodes.EXECUTOR_TEMPLATE_UNKNOWN,
        `未知模板：${name}。可用模板：${TEMPLATE_NAMES.join(', ')}`
      );
    }

    // Health check is mandatory before the first real run.
    if (!this.healthChecked) {
      await this.ping();
    }
    if (!this.healthOk) {
      throw new ExecutorError(
        ExecutorErrorCodes.EXECUTOR_BACKEND_UNAVAILABLE,
        'figma-console-mcp 健康检查失败'
      );
    }

    const code = buildTemplate(name, params);
    const t0 = Date.now();
    let resp: ExecuteResponse;
    try {
      resp = await this.backend.execute({
        code,
        timeout: this.options.defaultTimeout ?? 8000
      });
    } catch (e) {
      throw new ExecutorError(
        ExecutorErrorCodes.EXECUTOR_BACKEND_ERROR,
        `figma_execute 调用失败：${name}`,
        e
      );
    }
    const ms = Date.now() - t0;

    const warning = resp.resultAnalysis?.warning;
    this.executions.push({
      template: name,
      params,
      result: resp.result,
      ms,
      ...(warning !== undefined ? { warning } : {})
    });

    return resp.result;
  }

  /**
   * Convenience helper: cloneAndPlace then return the new node id from the
   * `{ id, name, x, y }` payload — this enforces the "re-read ID after clone"
   * rule by giving callers the new id in a single call.
   */
  async cloneAndPlace(
    params: TemplateParamMap['cloneAndPlace']
  ): Promise<{ id: string; name?: string; x: number; y: number }> {
    const r = await this.run('cloneAndPlace', params);
    return r as { id: string; name?: string; x: number; y: number };
  }
}
