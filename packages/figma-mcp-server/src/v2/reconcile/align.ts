/**
 * Sequence alignment used at every level of a sync (sections, clusters, items).
 *
 * LCS on keys first. Between two LCS anchors, deletions and insertions that
 * sit side by side are paired up position by position into "modify" — that
 * is what turns `[A, B, C] → [A, B', C]` into an edit of B rather than a
 * delete-plus-insert. Whatever is still unpaired and has an identical key on
 * the other side is a "move".
 */

export type Step =
  | { kind: 'keep'; o: number }
  | { kind: 'modify'; o: number }
  | { kind: 'move'; o: number }
  | { kind: 'insert' };

export interface Alignment {
  /** One step per new index. */
  byNew: Step[];
  /** Old indices with no counterpart in the new sequence, ascending. */
  deleted: number[];
}

export function alignSequences(
  oldKeys: string[],
  newKeys: string[],
  canPair: (o: number, n: number) => boolean = () => true
): Alignment {
  const n = oldKeys.length;
  const m = newKeys.length;
  // lcs[i][j] = LCS length of oldKeys[i..] and newKeys[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        oldKeys[i] === newKeys[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const byNew: Array<Step | undefined> = new Array(m).fill(undefined);
  const hunks: Array<{ dels: number[]; ins: number[] }> = [];
  let hunk = { dels: [] as number[], ins: [] as number[] };
  const closeHunk = () => {
    if (hunk.dels.length > 0 || hunk.ins.length > 0) hunks.push(hunk);
    hunk = { dels: [], ins: [] };
  };

  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && oldKeys[i] === newKeys[j]) {
      closeHunk();
      byNew[j] = { kind: 'keep', o: i };
      i++;
      j++;
    } else if (j >= m || (i < n && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      hunk.dels.push(i++);
    } else {
      hunk.ins.push(j++);
    }
  }
  closeHunk();

  // Moves first: an unchanged line that changed place must not be mistaken
  // for an edit of whatever happens to sit next to it.
  const movedOld = new Set<number>();
  const allIns = hunks.flatMap((h) => h.ins);
  const allDels = hunks.flatMap((h) => h.dels);
  for (const ni of allIns) {
    const o = allDels.find((d) => !movedOld.has(d) && oldKeys[d] === newKeys[ni]);
    if (o !== undefined) {
      movedOld.add(o);
      byNew[ni] = { kind: 'move', o };
    }
  }

  const deleted: number[] = [];
  for (const h of hunks) {
    const dels = h.dels.filter((d) => !movedOld.has(d));
    const ins = h.ins.filter((ni) => byNew[ni] === undefined);
    let d = 0;
    let k = 0;
    while (d < dels.length && k < ins.length) {
      const o = dels[d]!;
      const ni = ins[k]!;
      if (canPair(o, ni)) {
        byNew[ni] = { kind: 'modify', o };
        d++;
        k++;
      } else if (dels.length - d >= ins.length - k) {
        deleted.push(o);
        d++;
      } else {
        k++;
      }
    }
    for (; d < dels.length; d++) deleted.push(dels[d]!);
  }

  return {
    byNew: byNew.map((s) => s ?? { kind: 'insert' }),
    deleted: deleted.sort((a, b) => a - b)
  };
}
