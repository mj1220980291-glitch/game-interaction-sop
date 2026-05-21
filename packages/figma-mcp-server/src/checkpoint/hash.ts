/**
 * Stable JSON serialization & SHA-256 hashing utilities for checkpoint chain.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/engine-checkpoint/spec.md
 */

import { createHash } from 'node:crypto';

/**
 * Deterministic JSON: keys sorted, undefined elided. This guarantees identical
 * payload hashes across runs even if upstream code shuffles object key order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortValue);
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    const val = (v as Record<string, unknown>)[k];
    if (val === undefined) continue;
    sorted[k] = sortValue(val);
  }
  return sorted;
}

export function hash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
