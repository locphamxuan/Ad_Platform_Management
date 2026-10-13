import { useState } from 'react';

/**
 * Toggles one row; with `range` (Shift-click) every row between the previous click and this one
 * takes the clicked row's new state, so a whole block is selected with two clicks.
 */
export function toggleSelection(
  order: readonly string[],
  selected: ReadonlySet<string>,
  id: string,
  anchor: string | null,
  range: boolean,
): Set<string> {
  const next = new Set(selected);
  const select = !selected.has(id);
  const from = range && anchor !== null ? order.indexOf(anchor) : -1;
  const to = order.indexOf(id);
  const ids = from === -1 ? [id] : order.slice(Math.min(from, to), Math.max(from, to) + 1);
  for (const rowId of ids) {
    if (select) next.add(rowId);
    else next.delete(rowId);
  }
  return next;
}

/** Row selection for a table whose rows may change (filters, refetch): only visible ids count. */
export function useRowSelection(visibleIds: readonly string[]) {
  const [stored, setStored] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const selected = visibleIds.filter((id) => stored.has(id));
  const allSelected = visibleIds.length > 0 && selected.length === visibleIds.length;

  return {
    selected,
    isSelected: (id: string) => stored.has(id),
    allSelected,
    someSelected: selected.length > 0 && !allSelected,
    toggle: (id: string, range = false) => {
      setStored((prev) => toggleSelection(visibleIds, prev, id, anchor, range));
      setAnchor(id);
    },
    toggleAll: () => setStored(allSelected ? new Set() : new Set(visibleIds)),
    select: (ids: readonly string[]) => setStored(new Set(ids)),
    clear: () => setStored(new Set()),
  };
}
