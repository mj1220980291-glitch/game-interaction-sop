/**
 * Title cleanup. The DSL schema already forbids prefixes, but the planner
 * treats `title` as the FINAL Figma text — guarantee no markdown noise leaks
 * through here by stripping any subtitle markers / trailing whitespace.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/layout-planner/spec.md
 */

export function cleanTitle(rawTitle: string): string {
  let t = rawTitle.trim();
  // Defense-in-depth: strip leading numeric prefix and # markers if any
  // managed to slip through the DSL schema.
  t = t.replace(/^(?:\d+\s*[.、)]\s*)+/, '');
  t = t.replace(/^[#＃]+\s*/, '');
  // Strip trailing markdown emphasis or stray whitespace.
  t = t.replace(/[\s\u3000]+$/, '');
  return t;
}
