/**
 * Phase-level checkpoint store. Files land at:
 *   <root>/runs/<runId>/phase-<n>-<name>.json
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/engine-checkpoint/spec.md
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hash, stableStringify } from './hash.js';

export const CheckpointErrorCodes = {
  CHECKPOINT_BROKEN_CHAIN: 'CHECKPOINT_BROKEN_CHAIN',
  CHECKPOINT_INPUT_DRIFT: 'CHECKPOINT_INPUT_DRIFT',
  CHECKPOINT_NOT_FOUND: 'CHECKPOINT_NOT_FOUND'
} as const;
export type CheckpointErrorCode =
  (typeof CheckpointErrorCodes)[keyof typeof CheckpointErrorCodes];

export class CheckpointError extends Error {
  constructor(
    public readonly code: CheckpointErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CheckpointError';
  }
}

export interface PhaseCheckpoint<T = unknown> {
  runId: string;
  phase: number;
  name: string;
  inputHash: string;
  outputHash: string;
  /** Hash of the previous phase's output, or null for phase 1. */
  prevHash: string | null;
  payload: T;
  timestamp: string;
}

export interface CheckpointStoreOptions {
  /** Engine working directory (defaults to process.cwd()). */
  rootDir?: string;
}

export class CheckpointStore {
  private readonly root: string;

  constructor(opts: CheckpointStoreOptions = {}) {
    this.root = resolve(opts.rootDir ?? process.cwd(), 'runs');
  }

  /** Returns absolute directory for a given runId. Creates if missing. */
  ensureRunDir(runId: string): string {
    const dir = join(this.root, sanitizeId(runId));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Persist a phase checkpoint. Computes outputHash and validates the chain
   * (prevHash must equal the previous phase's outputHash, when phase > 1).
   */
  write<T>(opts: {
    runId: string;
    phase: number;
    name: string;
    input: unknown;
    payload: T;
  }): PhaseCheckpoint<T> {
    const dir = this.ensureRunDir(opts.runId);
    const inputHash = hash(opts.input);
    const outputHash = hash(opts.payload);

    let prevHash: string | null = null;
    if (opts.phase > 1) {
      const prev = this.readByPhase(opts.runId, opts.phase - 1);
      prevHash = prev?.outputHash ?? null;
    }

    const cp: PhaseCheckpoint<T> = {
      runId: opts.runId,
      phase: opts.phase,
      name: opts.name,
      inputHash,
      outputHash,
      prevHash,
      payload: opts.payload,
      timestamp: new Date().toISOString()
    };

    const file = join(dir, fileName(opts.phase, opts.name));
    writeFileSync(file, stableStringify(cp) + '\n', 'utf8');
    return cp;
  }

  /** Read a checkpoint by phase number, returning undefined if missing. */
  readByPhase(runId: string, phase: number): PhaseCheckpoint | undefined {
    const dir = join(this.root, sanitizeId(runId));
    if (!existsSync(dir)) return undefined;
    const target = readdirSync(dir).find((f) => f.startsWith(`phase-${phase}-`));
    if (!target) return undefined;
    return JSON.parse(readFileSync(join(dir, target), 'utf8')) as PhaseCheckpoint;
  }

  /**
   * Validate the chain from phase 1 up to (and including) `upto`. Throws
   * CheckpointError on any breakage.
   */
  validateChain(runId: string, upto: number): void {
    let prev: PhaseCheckpoint | undefined;
    for (let p = 1; p <= upto; p += 1) {
      const cp = this.readByPhase(runId, p);
      if (!cp) {
        throw new CheckpointError(
          CheckpointErrorCodes.CHECKPOINT_BROKEN_CHAIN,
          `phase ${p} 的 checkpoint 不存在，无法继续 replay`
        );
      }
      if (p > 1) {
        if (!prev) {
          throw new CheckpointError(
            CheckpointErrorCodes.CHECKPOINT_BROKEN_CHAIN,
            `phase ${p - 1} 的 checkpoint 不存在`
          );
        }
        if (cp.prevHash !== prev.outputHash) {
          throw new CheckpointError(
            CheckpointErrorCodes.CHECKPOINT_BROKEN_CHAIN,
            `phase ${p} 的 prevHash 与 phase ${p - 1} 的 outputHash 不一致`
          );
        }
      }
      prev = cp;
    }
  }

  /**
   * Compare a candidate input against the IR captured at phase 1. Throws
   * CHECKPOINT_INPUT_DRIFT if the hash differs (caller must re-generate).
   */
  assertInputUnchanged(runId: string, currentIr: unknown): void {
    const phase1 = this.readByPhase(runId, 1);
    if (!phase1) {
      throw new CheckpointError(
        CheckpointErrorCodes.CHECKPOINT_NOT_FOUND,
        `runId=${runId} 不存在 phase 1 checkpoint`
      );
    }
    if (hash(currentIr) !== phase1.inputHash) {
      throw new CheckpointError(
        CheckpointErrorCodes.CHECKPOINT_INPUT_DRIFT,
        '当前输入 IR 与 checkpoint 中的 hash 不一致，请重新执行 generate_interaction_doc'
      );
    }
  }
}

// ---- helpers -----------------------------------------------------------

function sanitizeId(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_');
}

function fileName(phase: number, name: string): string {
  return `phase-${phase}-${sanitizeId(name)}.json`;
}
