/**
 * Validation error codes & human-readable Chinese messages.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/interaction-doc-dsl/spec.md
 *
 * Each error MUST be raised with one of the codes below. The validator attaches
 * `{ code, message, line?, hint? }` to every issue.
 */

export const ErrorCodes = {
  DSL_MISSING_META: 'DSL_MISSING_META',
  DSL_META_VERSION_INVALID: 'DSL_META_VERSION_INVALID',
  DSL_META_URL_INSECURE: 'DSL_META_URL_INSECURE',
  DSL_SECTION_TITLE_HAS_PREFIX: 'DSL_SECTION_TITLE_HAS_PREFIX',
  DSL_SECTION_INDEX_DUPLICATE: 'DSL_SECTION_INDEX_DUPLICATE',
  DSL_ANCHOR_AMBIGUOUS: 'DSL_ANCHOR_AMBIGUOUS',
  DSL_ANCHOR_MISSING: 'DSL_ANCHOR_MISSING',
  DSL_BUBBLE_LAYER_MISSING: 'DSL_BUBBLE_LAYER_MISSING',
  DSL_BUBBLE_LAYER_INVALID: 'DSL_BUBBLE_LAYER_INVALID',
  DSL_YAML_PARSE_ERROR: 'DSL_YAML_PARSE_ERROR',
  DSL_SCHEMA_VIOLATION: 'DSL_SCHEMA_VIOLATION'
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const messages: Record<ErrorCode, string> = {
  DSL_MISSING_META: 'meta 字段缺失，根节点必须包含 meta、sections、designRefs、screenshots',
  DSL_META_VERSION_INVALID: 'meta.version 必须为语义化版本号，例如 1.0.0',
  DSL_META_URL_INSECURE: 'meta.designUrl 必须使用 https 协议',
  DSL_SECTION_TITLE_HAS_PREFIX:
    'section.title 不允许以序号或井号开头（如 "01."、"NN、"、"#"），请去掉前缀，序号由 index 字段表达',
  DSL_SECTION_INDEX_DUPLICATE: 'section.index 在文档内必须唯一',
  DSL_ANCHOR_AMBIGUOUS:
    'bubble.anchor 必须只包含 nodeId / absXY / sectionRelXY 中的一种，不能同时给出',
  DSL_ANCHOR_MISSING:
    'bubble.anchor 必须显式声明，且至少包含 nodeId / absXY / sectionRelXY 中的一种',
  DSL_BUBBLE_LAYER_MISSING: 'bubble.layer 字段缺失，必须显式声明 layer: overlay',
  DSL_BUBBLE_LAYER_INVALID: 'bubble.layer 仅支持取值 "overlay"',
  DSL_YAML_PARSE_ERROR: 'YAML 解析失败',
  DSL_SCHEMA_VIOLATION: 'DSL schema 校验失败'
};

export function messageFor(code: ErrorCode): string {
  return messages[code];
}

export interface ValidationError {
  code: ErrorCode;
  message: string;
  line?: number;
  hint?: string;
  path?: string;
}

export function makeError(
  code: ErrorCode,
  overrides: Partial<Omit<ValidationError, 'code' | 'message'>> & {
    message?: string;
  } = {}
): ValidationError {
  const { message, ...rest } = overrides;
  return {
    code,
    message: message ?? messageFor(code),
    ...rest
  };
}
