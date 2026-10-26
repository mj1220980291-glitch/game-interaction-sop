/**
 * Structural fingerprint of a template.
 *
 * Used to notice that a project changed its own template after we compiled a
 * pack. Text content is excluded on purpose — rewording a placeholder must not
 * look like a structural change. Node type, depth, child count, name and a
 * coarse size bucket are enough to catch real edits.
 */

import { createHash } from 'node:crypto';
import type { ProbeTree } from './tree.js';

function bucket(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return -1;
  if (v < 40) return 0;
  if (v < 200) return 1;
  if (v < 600) return 2;
  if (v < 1400) return 3;
  return 4;
}

export function structuralFingerprint(tree: ProbeTree): string {
  const parts: string[] = [];
  const visit = (node: ProbeTree['root']): void => {
    parts.push(
      [
        node.depth,
        node.type,
        node.children.length,
        `${bucket(node.box?.width)}x${bucket(node.box?.height)}`,
        node.visible ? 'v' : 'h',
        node.name.trim()
      ].join('~')
    );
    for (const c of node.children) visit(c);
  };
  visit(tree.root);
  const hash = createHash('sha256').update(parts.join('\n')).digest('hex');
  return `sha256:${hash}`;
}
