import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CheckpointError,
  CheckpointErrorCodes,
  CheckpointStore,
  hash
} from '../src/checkpoint/index.js';

/**
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/engine-checkpoint/spec.md
 */

describe('checkpoint/store', () => {
  let tmpRoot: string;
  let store: CheckpointStore;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'fid-engine-'));
    store = new CheckpointStore({ rootDir: tmpRoot });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('writes a phase 1 checkpoint with prevHash=null', () => {
    const cp = store.write({
      runId: 'r1',
      phase: 1,
      name: 'parse',
      input: { yaml: 'x' },
      payload: { ir: { meta: 1 } }
    });
    expect(cp.prevHash).toBeNull();
    expect(cp.inputHash).toBe(hash({ yaml: 'x' }));
    expect(cp.outputHash).toBe(hash({ ir: { meta: 1 } }));
  });

  it('files land at runs/<runId>/phase-<n>-<name>.json', () => {
    store.write({ runId: 'r2', phase: 3, name: 'plan', input: {}, payload: { ok: true } });
    const dir = join(tmpRoot, 'runs', 'r2');
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir);
    expect(files).toContain('phase-3-plan.json');
  });

  it('subsequent phase carries prev outputHash', () => {
    const a = store.write({
      runId: 'r3',
      phase: 1,
      name: 'parse',
      input: { yaml: 'x' },
      payload: { v: 1 }
    });
    const b = store.write({
      runId: 'r3',
      phase: 2,
      name: 'plan',
      input: a.payload,
      payload: { v: 2 }
    });
    expect(b.prevHash).toBe(a.outputHash);
  });

  it('validateChain passes on a clean run', () => {
    store.write({ runId: 'r4', phase: 1, name: 'a', input: 'i', payload: 1 });
    store.write({ runId: 'r4', phase: 2, name: 'b', input: 'i', payload: 2 });
    store.write({ runId: 'r4', phase: 3, name: 'c', input: 'i', payload: 3 });
    expect(() => store.validateChain('r4', 3)).not.toThrow();
  });

  it('validateChain throws CHECKPOINT_BROKEN_CHAIN when a phase is missing', () => {
    store.write({ runId: 'r5', phase: 1, name: 'a', input: 'i', payload: 1 });
    store.write({ runId: 'r5', phase: 3, name: 'c', input: 'i', payload: 3 });
    expect(() => store.validateChain('r5', 3)).toThrowError(CheckpointError);
    try {
      store.validateChain('r5', 3);
    } catch (e) {
      expect((e as CheckpointError).code).toBe(CheckpointErrorCodes.CHECKPOINT_BROKEN_CHAIN);
    }
  });

  it('validateChain throws CHECKPOINT_BROKEN_CHAIN when prevHash mismatches (payload tampered)', () => {
    store.write({ runId: 'r6', phase: 1, name: 'a', input: 'i', payload: 1 });
    store.write({ runId: 'r6', phase: 2, name: 'b', input: 'i', payload: 2 });
    // Manually corrupt phase 2's prevHash on disk.
    const dir = join(tmpRoot, 'runs', 'r6');
    const file = join(dir, 'phase-2-b.json');
    const cp = JSON.parse(readFileSync(file, 'utf8')) as { prevHash: string };
    cp.prevHash = 'tampered';
    writeFileSync(file, JSON.stringify(cp), 'utf8');

    expect(() => store.validateChain('r6', 2)).toThrowError(CheckpointError);
  });

  it('assertInputUnchanged passes when IR matches', () => {
    const ir = { v: 1 };
    store.write({ runId: 'r7', phase: 1, name: 'parse', input: ir, payload: ir });
    expect(() => store.assertInputUnchanged('r7', ir)).not.toThrow();
  });

  it('assertInputUnchanged throws CHECKPOINT_INPUT_DRIFT when IR differs', () => {
    store.write({ runId: 'r8', phase: 1, name: 'parse', input: { v: 1 }, payload: { v: 1 } });
    expect(() => store.assertInputUnchanged('r8', { v: 2 })).toThrowError(CheckpointError);
    try {
      store.assertInputUnchanged('r8', { v: 2 });
    } catch (e) {
      expect((e as CheckpointError).code).toBe(CheckpointErrorCodes.CHECKPOINT_INPUT_DRIFT);
    }
  });

  it('assertInputUnchanged throws CHECKPOINT_NOT_FOUND when run is empty', () => {
    expect(() => store.assertInputUnchanged('ghost', { v: 1 })).toThrowError(CheckpointError);
  });

  it('sanitizes runId to avoid path traversal', () => {
    store.write({ runId: '../evil', phase: 1, name: 'a', input: 'i', payload: 1 });
    // Should write to runs/__evil/, not escape the runs folder.
    const dir = join(tmpRoot, 'runs');
    const found = readdirSync(dir);
    expect(found.some((f) => f.includes('evil'))).toBe(true);
    expect(found.includes('..')).toBe(false);
  });

  it('hash is order-independent for object keys', () => {
    expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 }));
  });
});
