import yaml from 'js-yaml';
import { ZodError, type ZodIssue } from 'zod';
import { DocSchema, type Doc } from './schema.js';
import {
  ErrorCodes,
  makeError,
  messageFor,
  type ErrorCode,
  type ValidationError
} from './errors.js';

/**
 * Public validation result.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/interaction-doc-dsl/spec.md
 */
export type ValidationResult =
  | { ok: true; ir: Doc }
  | { ok: false; errors: ValidationError[] };

const ANCHOR_KEYS = ['nodeId', 'absXY', 'sectionRelXY'] as const;

/**
 * Validate a DSL YAML string. The function NEVER throws — every failure path
 * (YAML parse error, schema violation, semantic check) returns a structured
 * `{ ok: false, errors }` instead.
 */
export function validate(input: string): ValidationResult {
  // 1. YAML -> JS object
  let raw: unknown;
  try {
    raw = yaml.load(input, { json: false });
  } catch (e) {
    const err = e as yaml.YAMLException;
    return {
      ok: false,
      errors: [
        makeError(ErrorCodes.DSL_YAML_PARSE_ERROR, {
          message: `YAML 解析失败：${err.reason ?? err.message}`,
          line: err.mark?.line !== undefined ? err.mark.line + 1 : undefined
        })
      ]
    };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      errors: [
        makeError(ErrorCodes.DSL_SCHEMA_VIOLATION, {
          message: 'DSL 根节点必须是一个 YAML 映射（object）'
        })
      ]
    };
  }

  // 2. Pre-schema semantic checks that produce friendlier codes than zod alone.
  const preErrors: ValidationError[] = [];
  preErrors.push(...checkRootRequiredKeys(raw as Record<string, unknown>, input));
  preErrors.push(...checkAnchorAmbiguity(raw as Record<string, unknown>, input));

  if (preErrors.length > 0) {
    return { ok: false, errors: preErrors };
  }

  // 3. Zod schema validation
  const parsed = DocSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: zodToErrors(parsed.error, raw, input) };
  }

  // 4. Cross-section semantic checks
  const semanticErrors = checkSectionIndexUnique(parsed.data, input);
  if (semanticErrors.length > 0) {
    return { ok: false, errors: semanticErrors };
  }

  return { ok: true, ir: parsed.data };
}

// --- pre-schema checks --------------------------------------------------

function checkRootRequiredKeys(
  raw: Record<string, unknown>,
  source: string
): ValidationError[] {
  if (!('meta' in raw)) {
    return [
      makeError(ErrorCodes.DSL_MISSING_META, {
        line: locateKey(source, 'meta') ?? 1,
        hint: '请在文件顶部加入 meta:\n  title: ...\n  version: 1.0.0\n  project: ...\n  designUrl: https://...'
      })
    ];
  }
  return [];
}

function checkAnchorAmbiguity(
  raw: Record<string, unknown>,
  source: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  const sections = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return errors;

  for (let s = 0; s < sections.length; s += 1) {
    const section = sections[s];
    if (!section || typeof section !== 'object') continue;
    const bubbles = (section as { bubbles?: unknown }).bubbles;
    if (!Array.isArray(bubbles)) continue;

    for (let b = 0; b < bubbles.length; b += 1) {
      const bubble = bubbles[b];
      if (!bubble || typeof bubble !== 'object') continue;
      const anchor = (bubble as { anchor?: unknown }).anchor;

      if (anchor === undefined || anchor === null) {
        errors.push(
          makeError(ErrorCodes.DSL_ANCHOR_MISSING, {
            path: `sections[${s}].bubbles[${b}].anchor`,
            line: locateKey(source, 'anchor', s + b) ?? undefined
          })
        );
        continue;
      }

      if (typeof anchor !== 'object' || Array.isArray(anchor)) continue;

      const provided = ANCHOR_KEYS.filter((k) => k in (anchor as object));
      if (provided.length > 1) {
        errors.push(
          makeError(ErrorCodes.DSL_ANCHOR_AMBIGUOUS, {
            path: `sections[${s}].bubbles[${b}].anchor`,
            hint: `当前同时声明了 ${provided.join(' / ')}，请只保留一种`
          })
        );
      } else if (provided.length === 0) {
        errors.push(
          makeError(ErrorCodes.DSL_ANCHOR_MISSING, {
            path: `sections[${s}].bubbles[${b}].anchor`
          })
        );
      }
    }
  }
  return errors;
}

// --- post-schema checks -------------------------------------------------

function checkSectionIndexUnique(doc: Doc, _source: string): ValidationError[] {
  const seen = new Map<number, number>(); // index -> first occurrence (sections array idx)
  const errors: ValidationError[] = [];

  doc.sections.forEach((section, idx) => {
    const prev = seen.get(section.index);
    if (prev !== undefined) {
      errors.push(
        makeError(ErrorCodes.DSL_SECTION_INDEX_DUPLICATE, {
          path: `sections[${idx}].index`,
          hint: `index ${section.index} 已在 sections[${prev}] 中出现`
        })
      );
    } else {
      seen.set(section.index, idx);
    }
  });

  return errors;
}

// --- zod issue translation ---------------------------------------------

function zodToErrors(error: ZodError, raw: unknown, _source: string): ValidationError[] {
  return error.issues.map((issue) => translateIssue(issue, raw));
}

function translateIssue(issue: ZodIssue, raw: unknown): ValidationError {
  // Schema-attached custom code (via params.code) wins over the generic fallback.
  const params = (issue as { params?: { code?: ErrorCode } }).params;
  const customCode = params?.code;

  if (customCode && customCode in ErrorCodes) {
    return makeError(customCode, {
      message: messageFor(customCode),
      path: issue.path.join('.')
    });
  }

  const path = issue.path.join('.');

  // bubble.layer dual-code: missing vs invalid value.
  // Inspect raw object at the issue path to tell them apart, since
  // `invalid_literal` does not carry a `received` field.
  if (path.endsWith('layer')) {
    const present = isPathPresent(raw, issue.path);
    if (!present) {
      return makeError(ErrorCodes.DSL_BUBBLE_LAYER_MISSING, { path });
    }
    return makeError(ErrorCodes.DSL_BUBBLE_LAYER_INVALID, { path });
  }

  return makeError(ErrorCodes.DSL_SCHEMA_VIOLATION, {
    message: `${path || '(root)'}: ${issue.message}`,
    path
  });
}

function isPathPresent(raw: unknown, path: (string | number)[]): boolean {
  let cur: unknown = raw;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return false;
    if (Array.isArray(cur)) {
      const idx = typeof seg === 'number' ? seg : Number(seg);
      if (!Number.isFinite(idx) || idx < 0 || idx >= cur.length) return false;
      cur = cur[idx];
    } else {
      if (!(seg in (cur as Record<string, unknown>))) return false;
      cur = (cur as Record<string, unknown>)[seg as string];
    }
  }
  return cur !== undefined;
}

// --- utilities ----------------------------------------------------------

/**
 * Best-effort line lookup. Returns 1-based line of the first match of `key:`
 * (skipping `nth` matches) or undefined when not found. This is intentionally
 * primitive — the YAML AST is not exposed by js-yaml, and full source-mapping
 * is not worth the dependency cost for v0.x.
 */
function locateKey(source: string, key: string, nth = 0): number | undefined {
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`, 'mg');
  let m: RegExpExecArray | null;
  let found = -1;
  let counter = 0;
  while ((m = re.exec(source)) !== null) {
    if (counter === nth) {
      found = m.index;
      break;
    }
    counter += 1;
  }
  if (found < 0) return undefined;
  return source.slice(0, found).split(/\r?\n/).length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
