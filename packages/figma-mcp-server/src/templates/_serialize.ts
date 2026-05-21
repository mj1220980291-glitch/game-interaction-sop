/**
 * Safe JS string serializer. Wraps a value in single quotes and escapes
 * backslashes / quotes / newlines / unicode bidi controls. Used by all
 * figma_execute templates so user-supplied params can never break out of
 * the string literal.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 */

export function jsString(s: string): string {
  // JSON.stringify yields a valid JS string literal that handles every escape
  // including non-BMP characters, plus it is unambiguous (double quotes).
  return JSON.stringify(String(s));
}
