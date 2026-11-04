/**
 * Phase 1 完成声明 — SOP 的「挖掘做完没有」从自觉变成机器可验证。
 *
 * 回执 S4：SOP 明文「4 维度全满才可进 Phase 2」，但全部靠 agent 自觉，
 * 没有任何强制产物，于是需求常常在文档写完之后才补挖。
 *
 * 声明是一个 JSON 文件（默认 `.interaction-sop/phase1-signoff.json`），
 * 校验规则只有四条，全部是布尔判断，不做语义解释：
 *
 *   1. `schema_version` 必须是 1
 *   2. `unresolved_conflicts` 必须是空数组
 *   3. `pending_questions` 必须是空数组
 *   4. `dimensions` 里 4 个维度必须都为 true
 *      （params / diff_areas / business / conflicts）
 *
 * `evidence` 是给人看的（每条维度为什么算满），引擎不校验内容。
 */

export const PHASE1_SIGNON_VERSION = 1;

export const PHASE1_DIMENSIONS = ['params', 'diff_areas', 'business', 'conflicts'] as const;

export type Phase1Dimension = (typeof PHASE1_DIMENSIONS)[number];

export interface Phase1Signoff {
  schema_version: 1;
  /** 需求名，仅用于对账（同名覆盖）。 */
  requirement?: string;
  checked_at?: string;
  unresolved_conflicts: unknown[];
  pending_questions: unknown[];
  dimensions: Partial<Record<Phase1Dimension, boolean>>;
  /** 每条维度的依据（可选，仅给人看）。 */
  evidence?: Partial<Record<Phase1Dimension, string>>;
}

export interface SignoffIssue {
  code: string;
  message: string;
}

export interface SignoffCheck {
  ok: boolean;
  errors: SignoffIssue[];
  warnings: SignoffIssue[];
  /** 收敛后的声明（ok 时给出，便于落盘 / 回显）。 */
  signoff?: Phase1Signoff;
}

const DIMENSION_LABEL: Record<Phase1Dimension, string> = {
  params: '可调参数齐',
  diff_areas: '差异领域已拍板',
  business: '业务专属齐',
  conflicts: '冲突已清零'
};

export function checkPhase1Signoff(raw: unknown): SignoffCheck {
  const errors: SignoffIssue[] = [];
  const warnings: SignoffIssue[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      errors: [
        {
          code: 'V2_SIGNOFF_INVALID',
          message: 'phase1Signoff 必须是对象：{ schema_version, unresolved_conflicts, pending_questions, dimensions }'
        }
      ],
      warnings
    };
  }
  const v = raw as Record<string, unknown>;
  if (v['schema_version'] !== 1) {
    errors.push({
      code: 'V2_SIGNOFF_INVALID',
      message: `phase1Signoff.schema_version 必须是 1（收到 ${JSON.stringify(v['schema_version'])}）`
    });
  }

  const conflicts = v['unresolved_conflicts'];
  if (!Array.isArray(conflicts)) {
    errors.push({
      code: 'V2_SIGNOFF_INVALID',
      message: 'phase1Signoff.unresolved_conflicts 必须是数组（清零时传 []）'
    });
  } else if (conflicts.length > 0) {
    errors.push({
      code: 'V2_SIGNOFF_CONFLICTS_OPEN',
      message: `phase1Signoff.unresolved_conflicts 未清零（还有 ${conflicts.length} 条）：${conflicts
        .slice(0, 3)
        .map((c) => (typeof c === 'string' ? c : JSON.stringify(c)))
        .join(' / ')}`
    });
  }

  const pending = v['pending_questions'];
  if (!Array.isArray(pending)) {
    errors.push({
      code: 'V2_SIGNOFF_INVALID',
      message: 'phase1Signoff.pending_questions 必须是数组（问完了传 []）'
    });
  } else if (pending.length > 0) {
    errors.push({
      code: 'V2_SIGNOFF_PENDING_QUESTIONS',
      message: `phase1Signoff.pending_questions 非空（还有 ${pending.length} 个问题没问完）`
    });
  }

  const dimensions = v['dimensions'];
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    errors.push({
      code: 'V2_SIGNOFF_DIMENSIONS_INCOMPLETE',
      message: `phase1Signoff.dimensions 缺失：四个维度必须显式声明 true（${PHASE1_DIMENSIONS.join(' / ')}）`
    });
  } else {
    const dims = dimensions as Record<string, unknown>;
    for (const key of PHASE1_DIMENSIONS) {
      if (dims[key] !== true) {
        errors.push({
          code: 'V2_SIGNOFF_DIMENSIONS_INCOMPLETE',
          message: `phase1Signoff.dimensions.${key}（${DIMENSION_LABEL[key]}）不是 true`
        });
      }
    }
    const extra = Object.keys(dims).filter(
      (k) => !(PHASE1_DIMENSIONS as readonly string[]).includes(k)
    );
    if (extra.length > 0) {
      warnings.push({
        code: 'V2_SIGNOFF_UNKNOWN_DIMENSION',
        message: `phase1Signoff.dimensions 里有未识别的维度：${extra.join(' / ')}（已忽略）`
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ...(errors.length === 0 ? { signoff: v as unknown as Phase1Signoff } : {})
  };
}

/** 一份可直接落盘的空白模板（skill 侧照抄，填完再提交校验）。 */
export function emptyPhase1Signoff(requirement?: string): Phase1Signoff {
  return {
    schema_version: 1,
    ...(requirement ? { requirement } : {}),
    unresolved_conflicts: [],
    pending_questions: [],
    dimensions: { params: false, diff_areas: false, business: false, conflicts: false },
    evidence: {}
  };
}
