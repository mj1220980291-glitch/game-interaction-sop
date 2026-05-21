import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPipeline, PHASE_NAMES } from '../src/server/pipeline.js';
import { CheckpointStore } from '../src/checkpoint/index.js';
import {
  Executor,
  type FigmaExecuteBackend
} from '../src/executor/index.js';

/**
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/engine-mcp-server/spec.md
 *
 * The pipeline test focuses on orchestration: which phases write checkpoints,
 * which run figma_execute, dry-run mode (no executor), and replay (fromPhase>1).
 */

const VALID_YAML = `
meta:
  title: 流水线烟雾
  version: 1.0.0
  project: smoke
  designUrl: https://www.figma.com/design/x?node-id=1-2
sections:
  - index: 1
    title: 章节一
    bubbles:
      - id: "1"
        text: 气泡一
        layer: overlay
        anchor: { nodeId: "1:2" }
designRefs:
  - name: 主图
    url: https://www.figma.com/design/x?node-id=1-2
    nodeId: "1:2"
screenshots: []
`.trim();

class FakeBackend implements FigmaExecuteBackend {
  public executeCalls: Array<{ code: string }> = [];

  async status() {
    return { ok: true, version: 'fake' };
  }

  async execute(req: { code: string }) {
    this.executeCalls.push({ code: req.code });
    return { result: { ok: true } };
  }
}

describe('pipeline — dry-run (no executor)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fid-pipe-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('only runs phase 1 (parse) + phase 2 (plan)', async () => {
    const store = new CheckpointStore({ rootDir: tmp });
    const r = await runPipeline({ runId: 'dry1', yaml: VALID_YAML, store });
    expect(r.errors).toBeUndefined();
    expect(r.completedPhases).toEqual(['parse', 'plan']);
    expect(r.ir).toBeDefined();
    expect(r.plan).toBeDefined();
    expect(r.executions).toEqual([]);
  });

  it('returns parse errors when DSL is invalid', async () => {
    const store = new CheckpointStore({ rootDir: tmp });
    const r = await runPipeline({ runId: 'dry2', yaml: 'sections: []\n', store });
    expect(r.errors).toBeDefined();
    expect(r.errors!.length).toBeGreaterThan(0);
    expect(r.completedPhases).toEqual([]);
  });
});

describe('pipeline — full run with executor', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fid-pipe-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('completes all 7 phases when executor + valid yaml', async () => {
    const store = new CheckpointStore({ rootDir: tmp });
    const backend = new FakeBackend();
    const executor = new Executor(backend);
    const r = await runPipeline({ runId: 'full1', yaml: VALID_YAML, store, executor });
    expect(r.errors).toBeUndefined();
    expect(r.completedPhases).toEqual([...PHASE_NAMES]);
    // bubble inject + final snapshot → at least 2 figma_execute calls.
    expect(backend.executeCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('records all phases as checkpoints on disk', async () => {
    const store = new CheckpointStore({ rootDir: tmp });
    const backend = new FakeBackend();
    const r = await runPipeline({
      runId: 'cp1',
      yaml: VALID_YAML,
      store,
      executor: new Executor(backend)
    });
    expect(r.errors).toBeUndefined();
    for (let p = 1; p <= 7; p += 1) {
      expect(store.readByPhase('cp1', p), `phase ${p}`).toBeDefined();
    }
    // Chain validation passes end-to-end.
    expect(() => store.validateChain('cp1', 7)).not.toThrow();
  });
});

describe('pipeline — replay from checkpoint', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fid-pipe-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('skips earlier phases when fromPhase > 1, reuses cached IR', async () => {
    const store = new CheckpointStore({ rootDir: tmp });
    // First, do a full run so checkpoints exist.
    const backendA = new FakeBackend();
    await runPipeline({
      runId: 'rp1',
      yaml: VALID_YAML,
      store,
      executor: new Executor(backendA)
    });
    const initialCalls = backendA.executeCalls.length;

    // Replay from phase 5 → only inject-bubbles + inject-screenshots +
    // snapshot-and-report should run figma_execute.
    const backendB = new FakeBackend();
    const r = await runPipeline({
      runId: 'rp1',
      yaml: '', // ignored when fromPhase > 1
      store,
      executor: new Executor(backendB),
      fromPhase: 5
    });
    expect(r.errors).toBeUndefined();
    // completedPhases only contains the phases that ACTUALLY re-ran.
    expect(r.completedPhases).toEqual([
      'inject-bubbles',
      'inject-screenshots',
      'snapshot-and-report'
    ]);
    // We did NOT run earlier phases — initial run included clone-template +
    // inject-sections which do no executor calls, so call counts can match
    // exactly. The replay's calls must be <= initial.
    expect(backendB.executeCalls.length).toBeLessThanOrEqual(initialCalls);
  });

  it('returns CHECKPOINT_NOT_FOUND when fromPhase > 1 but checkpoint missing', async () => {
    const store = new CheckpointStore({ rootDir: tmp });
    const backend = new FakeBackend();
    const r = await runPipeline({
      runId: 'ghost',
      yaml: '',
      store,
      executor: new Executor(backend),
      fromPhase: 3
    });
    expect(r.errors).toBeDefined();
    expect(r.errors![0]?.code).toBe('CHECKPOINT_NOT_FOUND');
  });
});
