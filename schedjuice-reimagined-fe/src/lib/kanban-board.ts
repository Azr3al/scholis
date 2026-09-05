/**
 * Domain-agnostic kanban helpers shared by every board (Leads, Issues, ...).
 * Domain-specific grouping/move logic (e.g. `leads-board.ts`) should delegate here.
 */

export function groupByColumnId<C extends { id: number }, T>(
  columns: C[],
  items: T[],
  getColumnId: (item: T) => number,
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const column of columns) {
    grouped.set(column.id, []);
  }
  for (const item of items) {
    const columnId = getColumnId(item);
    const bucket = grouped.get(columnId);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(columnId, [item]);
    }
  }
  return grouped;
}

export function applyOptimisticMove<T extends { id: number }>(
  items: T[],
  itemId: number,
  patch: (item: T) => T,
): T[] {
  return items.map((item) => (item.id === itemId ? patch(item) : item));
}
