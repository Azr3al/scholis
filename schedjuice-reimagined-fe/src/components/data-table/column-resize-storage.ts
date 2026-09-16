import type { ColumnSizingState } from "@tanstack/react-table";

const STORAGE_PREFIX = "schedjuice:table-column-widths:";

export function columnResizeStorageKey(tableKey: string): string {
  return `${STORAGE_PREFIX}${tableKey}`;
}

export function readColumnResizeWidths(
  tableKey: string,
): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(columnResizeStorageKey(tableKey));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writeColumnResizeWidths(
  tableKey: string,
  widths: ColumnSizingState,
): void {
  try {
    localStorage.setItem(
      columnResizeStorageKey(tableKey),
      JSON.stringify(widths),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function mergeColumnSizingWithStored(
  defaults: ColumnSizingState,
  stored: Record<string, number>,
  columnIds: string[],
): ColumnSizingState {
  const allowed = new Set(columnIds);
  const merged = { ...defaults };
  for (const [colId, width] of Object.entries(stored)) {
    if (allowed.has(colId)) {
      merged[colId] = width;
    }
  }
  return merged;
}
