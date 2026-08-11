/**
 * 7-phase orchestrator: parse → validate → plan → clone-template →
 * inject-sections → inject-bubbles → inject-screenshots → snapshot-and-report.
 *
 * Spec:
 *   openspec/changes/build-figma-interaction-doc-engine/specs/engine-mcp-server/spec.md
 *   openspec/changes/build-figma-interaction-doc-engine/specs/engine-checkpoint/spec.md
 *
 * Phases 1-2 (validate) and 3 (plan) are pure; phases 4-7 talk to Figma via
 * the executor. The pipeline accepts an optional executor — when omitted,
 * only 1-3 run, which is exactly what `dry_run_layout` needs.
 */

import { validate, type Doc, type ValidationError } from '../dsl/index.js';
import { plan, type PlanOutput } from '../planner/index.js';
import { CheckpointStore, type PhaseCheckpoint } from '../checkpoint/index.js';
import { Executor, type ExecutionLogEntry } from '../executor/index.js';

export const PHASE_NAMES = [
  'parse',
  'plan',
  'clone-template',
  'inject-sections',
  'inject-bubbles',
  'inject-screenshots',
  'snapshot-and-report'
] as const;
export type PhaseName = (typeof PHASE_NAMES)[number];

export interface PipelineOptions {
  runId: string;
  yaml: string;
  store: CheckpointStore;
  executor?: Executor;
  /** When true (replay mode), reuse existing checkpoints up to fromPhase-1. */
  fromPhase?: number;
}

export interface PipelineResult {
  runId: string;
  completedPhases: PhaseName[];
  ir?: Doc;
  plan?: PlanOutput;
  executions: ExecutionLogEntry[];
  warnings: PipelineWarning[];
  errors?: PipelineError[];
}

export interface PipelineWarning {
  phase: PhaseName;
  code: string;
  message: string;
}

export interface PipelineError {
  phase: PhaseName;
  code: string;
  message: string;
}

const PHASE_INDEX = new Map<PhaseName, number>(PHASE_NAMES.map((n, i) => [n, i + 1]));

/**
 * Run the pipeline. Each phase writes a checkpoint on success. On phase
 * failure the function returns a partial result with `errors` populated —
 * callers (the MCP server tool handler) translate that into the wire-level
 * error envelope.
 */
export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { runId, store, executor, yaml, fromPhase = 1 } = opts;
  const completedPhases: PhaseName[] = [];
  const warnings: PipelineWarning[] = [];

  // ------- phase 1: validate (parse YAML + zod check) -----------------
  let ir: Doc;
  if (fromPhase <= 1) {
    const v = validate(yaml);
    if (!v.ok) {
      return failed('parse', toPipelineErrors('parse', v.errors), runId, completedPhases, warnings);
    }
    ir = v.ir;
    store.write({ runId, phase: 1, name: 'parse', input: { yaml }, payload: ir });
    completedPhases.push('parse');
  } else {
    const cp = store.readByPhase(runId, 1) as PhaseCheckpoint<Doc> | undefined;
    if (!cp) {
      return failed(
        'parse',
        [{ phase: 'parse', code: 'CHECKPOINT_NOT_FOUND', message: '缺少 phase 1 checkpoint' }],
        runId,
        completedPhases,
        warnings
      );
    }
    ir = cp.payload;
  }

  // ------- phase 2: plan ---------------------------------------------
  let planOut: PlanOutput;
  if (fromPhase <= 2) {
    planOut = plan(ir);
    for (const w of planOut.warnings) {
      warnings.push({ phase: 'plan', code: w.code, message: w.message });
    }
    store.write({ runId, phase: 2, name: 'plan', input: ir, payload: planOut });
    completedPhases.push('plan');
  } else {
    const cp = store.readByPhase(runId, 2) as PhaseCheckpoint<PlanOutput> | undefined;
    if (!cp) {
      return failed(
        'plan',
        [{ phase: 'plan', code: 'CHECKPOINT_NOT_FOUND', message: '缺少 phase 2 checkpoint' }],
        runId,
        completedPhases,
        warnings
      );
    }
    planOut = cp.payload;
  }

  // No executor → dry-run mode. Phases 3+ are skipped.
  if (!executor) {
    return {
      runId,
      completedPhases,
      ir,
      plan: planOut,
      executions: [],
      warnings
    };
  }

  // ------- phases 3-7: figma side effects ------------------------------
  const figmaPhases: PhaseName[] = [
    'clone-template',
    'inject-sections',
    'inject-bubbles',
    'inject-screenshots',
    'snapshot-and-report'
  ];
  for (const ph of figmaPhases) {
    const phaseNum = PHASE_INDEX.get(ph)!;
    if (fromPhase > phaseNum) {
      const cp = store.readByPhase(runId, phaseNum);
      if (!cp) {
        return failed(
          ph,
          [{ phase: ph, code: 'CHECKPOINT_NOT_FOUND', message: `缺少 phase ${phaseNum} checkpoint` }],
          runId,
          completedPhases,
          warnings,
          executor.executions
        );
      }
      continue;
    }

    try {
      const phaseOutput = await runFigmaPhase(ph, planOut, executor);
      store.write({ runId, phase: phaseNum, name: ph, input: planOut, payload: phaseOutput });
      completedPhases.push(ph);
    } catch (e) {
      const err = e as Error & { code?: string };
      return failed(
        ph,
        [{ phase: ph, code: err.code ?? 'PIPELINE_PHASE_ERROR', message: err.message }],
        runId,
        completedPhases,
        warnings,
        executor.executions
      );
    }
  }

  return {
    runId,
    completedPhases,
    ir,
    plan: planOut,
    executions: executor.executions,
    warnings
  };
}

// ---- helpers -----------------------------------------------------------

async function runFigmaPhase(
  phase: PhaseName,
  planOut: PlanOutput,
  executor: Executor
): Promise<unknown> {
  // The first 4 figma phases are intentionally THIN — they exercise the
  // executor's templates with the plan's instructions, but the actual scene
  // graph manipulation logic is owned by the templates. We DO NOT generate
  // arbitrary figma logic here; everything goes through Executor.run(name, ...).
  switch (phase) {
    case 'clone-template': {
      // Without a real source template ID we cannot clone — this phase is a
      // contract between the doc author (who supplies a template via designUrl)
      // and the engine. For now we record the intent; future versions will
      // resolve designRefs[0].nodeId → actual template node.
      return { intent: 'clone-template', templateChoice: planOut.templateChoice };
    }
    case 'inject-sections': {
      const created: Array<{ index: number; title: string }> = [];
      for (const s of planOut.sections) {
        // The actual section frame creation happens in a future template
        // (createSectionFrame). For phase-7 readiness we record the intent.
        created.push({ index: s.index, title: s.title });
      }
      return { sections: created };
    }
    case 'inject-bubbles': {
      const inserted: Array<{ bubbleId: string; parentId: string; childId: string }> = [];
      for (const s of planOut.sections) {
        for (const b of s.bubbles) {
          // Real impl: cloneAndPlace bubble template node, then insertOverlay.
          // For now, exercise the executor with insertOverlay so the run
          // report contains real figma_execute calls.
          await executor.run('insertOverlay', {
            parentId: b.insert.parentId,
            childId: b.insert.childId
          });
          inserted.push({
            bubbleId: b.bubbleId,
            parentId: b.insert.parentId,
            childId: b.insert.childId
          });
        }
      }
      return { inserted };
    }
    case 'inject-screenshots': {
      const slots = planOut.sections.map((s) => s.screenshot);
      return { slots };
    }
    case 'snapshot-and-report': {
      // Capture a snapshot of the first section's parent (or skip if no plan).
      const first = planOut.sections[0]?.bubbles[0]?.insert.parentId;
      if (first) {
        await executor.run('captureSnapshot', { nodeId: first, scale: 1 });
      }
      return { sectionsCount: planOut.sections.length };
    }
    /* istanbul ignore next — exhaustive check */
    default:
      throw new Error(`unknown phase: ${phase as string}`);
  }
}

function toPipelineErrors(phase: PhaseName, errs: ValidationError[]): PipelineError[] {
  return errs.map((e) => ({ phase, code: e.code, message: e.message }));
}

function failed(
  _phase: PhaseName,
  errors: PipelineError[],
  runId: string,
  completedPhases: PhaseName[],
  warnings: PipelineWarning[],
  executions: ExecutionLogEntry[] = []
): PipelineResult {
  return {
    runId,
    completedPhases,
    executions,
    warnings,
    errors
  };
}
