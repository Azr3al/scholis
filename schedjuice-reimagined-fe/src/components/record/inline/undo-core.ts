export const UNDO_WINDOW_MS = 5000;

export type UndoEntry = {
  field: string;
  previousValue: unknown;
  at: number;
};

export function makeUndoEntry(
  field: string,
  previousValue: unknown,
  at: number = Date.now(),
): UndoEntry {
  return { field, previousValue, at };
}

export function isUndoVisible(entry: UndoEntry | null, now: number = Date.now()): boolean {
  if (!entry) return false;
  return now - entry.at < UNDO_WINDOW_MS;
}
