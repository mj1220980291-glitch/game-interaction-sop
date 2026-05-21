import { describe, expect, it } from 'vitest';
import {
  Executor,
  ExecutorError,
  ExecutorErrorCodes,
  type FigmaExecuteBackend,
  type ExecuteResponse,
  type StatusResponse
} from '../src/executor/index.js';

/**
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 */

interface FakeCall {
  code: string;
  timeout?: number;
}

class FakeBackend implements FigmaExecuteBackend {
  public calls: FakeCall[] = [];

  constructor(
    private readonly opts: {
      statusOk?: boolean;
      statusError?: Error;
      executeError?: Error;
      executeResult?: (call: FakeCall) => unknown;
      warning?: string;
    } = {}
  ) {}

  async status(): Promise<StatusResponse> {
    if (this.opts.statusError) throw this.opts.statusError;
    return { ok: this.opts.statusOk ?? true, version: '0.0.0-test' };
  }

  async execute(req: { code: string; timeout?: number }): Promise<ExecuteResponse> {
    if (this.opts.executeError) throw this.opts.executeError;
    const call: FakeCall = { code: req.code, ...(req.timeout !== undefined ? { timeout: req.timeout } : {}) };
    this.calls.push(call);
    const result = this.opts.executeResult ? this.opts.executeResult(call) : { id: 'fake:1' };
    return {
      result,
      ...(this.opts.warning !== undefined
        ? { resultAnalysis: { warning: this.opts.warning } }
        : {})
    };
  }
}

describe('executor — happy path', () => {
  it('runs cloneAndPlace and returns the new node id from the clone (not the source id)', async () => {
    let counter = 0;
    const backend = new FakeBackend({
      executeResult: () => {
        counter += 1;
        return { id: `clone-${counter}`, name: 'cloned', x: 10, y: 20 };
      }
    });
    const ex = new Executor(backend);
    const r = await ex.cloneAndPlace({ sourceId: 'src:1', parentId: 'parent:1', x: 10, y: 20 });
    expect(r.id).toBe('clone-1');
    expect(r.id).not.toBe('src:1');
  });

  it('subsequent fillText uses the new clone id', async () => {
    const backend = new FakeBackend({
      executeResult: (call) => {
        if (call.code.includes('clone()')) {
          return { id: 'new-id', name: 'n', x: 0, y: 0 };
        }
        return { id: 'new-id', characters: 'hello' };
      }
    });
    const ex = new Executor(backend);
    const cloned = await ex.cloneAndPlace({ sourceId: 'src:1', parentId: 'p:1', x: 0, y: 0 });
    await ex.run('fillText', { nodeId: cloned.id, text: 'hello' });

    const lastCall = backend.calls[backend.calls.length - 1]!;
    expect(lastCall.code).toContain('"new-id"');
    expect(lastCall.code).not.toContain('src:1');
  });

  it('records execution log with template, params, ms', async () => {
    const ex = new Executor(new FakeBackend({}));
    await ex.run('insertOverlay', { parentId: 'p', childId: 'c' });
    expect(ex.executions).toHaveLength(1);
    const e = ex.executions[0]!;
    expect(e.template).toBe('insertOverlay');
    expect(e.params).toEqual({ parentId: 'p', childId: 'c' });
    expect(typeof e.ms).toBe('number');
  });

  it('captures backend warning into the log', async () => {
    const ex = new Executor(new FakeBackend({ warning: '空数组返回' }));
    await ex.run('insertOverlay', { parentId: 'p', childId: 'c' });
    expect(ex.executions[0]!.warning).toBe('空数组返回');
  });
});

describe('executor — backend health', () => {
  it('throws EXECUTOR_BACKEND_UNAVAILABLE when status() throws', async () => {
    const backend = new FakeBackend({ statusError: new Error('boom') });
    const ex = new Executor(backend);
    await expect(ex.ping()).rejects.toMatchObject({
      code: ExecutorErrorCodes.EXECUTOR_BACKEND_UNAVAILABLE
    });
  });

  it('throws EXECUTOR_BACKEND_UNAVAILABLE when status reports !ok', async () => {
    const backend = new FakeBackend({ statusOk: false });
    const ex = new Executor(backend);
    await expect(
      ex.run('insertOverlay', { parentId: 'p', childId: 'c' })
    ).rejects.toMatchObject({ code: ExecutorErrorCodes.EXECUTOR_BACKEND_UNAVAILABLE });
  });

  it('caches status — does not re-call backend.status on each run', async () => {
    let statusCalls = 0;
    const backend: FigmaExecuteBackend = {
      async status() {
        statusCalls += 1;
        return { ok: true };
      },
      async execute() {
        return { result: { id: 'x' } };
      }
    };
    const ex = new Executor(backend);
    await ex.run('insertOverlay', { parentId: 'p', childId: 'c' });
    await ex.run('insertOverlay', { parentId: 'p', childId: 'c' });
    expect(statusCalls).toBe(1);
  });
});

describe('executor — refuses raw JS', () => {
  it('the Executor public surface has no runRaw method', () => {
    const ex = new Executor(new FakeBackend({}));
    expect((ex as unknown as Record<string, unknown>).runRaw).toBeUndefined();
  });

  it('throws EXECUTOR_TEMPLATE_UNKNOWN for unregistered templates', async () => {
    const ex = new Executor(new FakeBackend({}));
    await expect(
      // @ts-expect-error — intentionally passing an invalid template name
      ex.run('evilArbitraryJs', {})
    ).rejects.toBeInstanceOf(ExecutorError);
  });
});

describe('executor — backend error wrapping', () => {
  it('wraps execute() failure as EXECUTOR_BACKEND_ERROR', async () => {
    const backend = new FakeBackend({ executeError: new Error('mcp 500') });
    const ex = new Executor(backend);
    await expect(
      ex.run('insertOverlay', { parentId: 'p', childId: 'c' })
    ).rejects.toMatchObject({ code: ExecutorErrorCodes.EXECUTOR_BACKEND_ERROR });
  });
});
