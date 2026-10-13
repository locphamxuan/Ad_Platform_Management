import { describe, expect, it } from 'vitest';
import { toggleSelection } from '../src/lib/selection';

const ORDER = ['a', 'b', 'c', 'd', 'e'];
const sorted = (set: Set<string>) => [...set].sort();

describe('toggleSelection', () => {
  it('toggles a single row', () => {
    expect(sorted(toggleSelection(ORDER, new Set(), 'b', null, false))).toEqual(['b']);
    expect(sorted(toggleSelection(ORDER, new Set(['b']), 'b', null, false))).toEqual([]);
  });

  it('selects a whole block with Shift, in either direction', () => {
    expect(sorted(toggleSelection(ORDER, new Set(['b']), 'd', 'b', true))).toEqual(['b', 'c', 'd']);
    expect(sorted(toggleSelection(ORDER, new Set(['d']), 'a', 'd', true))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('deselects a block when the clicked row was selected', () => {
    expect(sorted(toggleSelection(ORDER, new Set(ORDER), 'd', 'b', true))).toEqual(['a', 'e']);
  });

  it('falls back to a single toggle when the anchor is gone', () => {
    expect(sorted(toggleSelection(ORDER, new Set(), 'c', 'zz', true))).toEqual(['c']);
  });
});
