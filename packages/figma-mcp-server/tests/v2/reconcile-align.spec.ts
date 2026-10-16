import { describe, it, expect } from 'vitest';
import { alignSequences } from '../../src/v2/reconcile/align.js';

const kinds = (oldK: string[], newK: string[]) => {
  const a = alignSequences(oldK, newK);
  return {
    byNew: a.byNew.map((s) => (s.kind === 'insert' ? 'insert' : `${s.kind}:${s.o}`)),
    deleted: a.deleted
  };
};

describe('alignSequences', () => {
  it('identical sequences are all keeps', () => {
    expect(kinds(['a', 'b'], ['a', 'b'])).toEqual({ byNew: ['keep:0', 'keep:1'], deleted: [] });
  });

  it('a line inserted in the middle is a single insert', () => {
    expect(kinds(['a', 'b', 'c'], ['a', 'x', 'b', 'c'])).toEqual({
      byNew: ['keep:0', 'insert', 'keep:1', 'keep:2'],
      deleted: []
    });
  });

  it('a rewritten line pairs into a modify', () => {
    expect(kinds(['a', 'b', 'c'], ['a', "b'", 'c'])).toEqual({
      byNew: ['keep:0', 'modify:1', 'keep:2'],
      deleted: []
    });
  });

  it('a line moved elsewhere is a move, not an edit of its new neighbour', () => {
    expect(kinds(['a', 'b', 'c'], ['a', 'x', 'c', 'b'])).toEqual({
      byNew: ['keep:0', 'insert', 'keep:2', 'move:1'],
      deleted: []
    });
  });

  it('pure deletion', () => {
    expect(kinds(['a', 'b', 'c'], ['a', 'c'])).toEqual({ byNew: ['keep:0', 'keep:2'], deleted: [1] });
  });

  it('canPair keeps incompatible lines apart', () => {
    const a = alignSequences(['rule:a', 'figure:x'], ['rule:a', 'rule:y'], (o) => o === 0);
    expect(a.byNew.map((s) => s.kind)).toEqual(['keep', 'insert']);
    expect(a.deleted).toEqual([1]);
  });
});
