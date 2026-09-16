import type { SheetAdapter, SortState } from "../types";

function compareCellValues(a: string, b: string): number {
  const aBlank = a.trim() === "";
  const bBlank = b.trim() === "";
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function compareNumeric(a: number | null, b: number | null): number {
  const aBlank = a === null;
  const bBlank = b === null;
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  return a - b;
}

/** Maps each display row index to its source row index after sorting. */
export function buildSortedRowIndices(
  rowCount: number,
  sort: SortState | null,
  adapter: SheetAdapter,
  numericFields: readonly string[],
  baseDisplayToSource: (displayRow: number) => number,
): number[] {
  const indices = Array.from({ length: rowCount }, (_, i) => i);
  if (!sort) return indices;

  const { field, direction } = sort;
  const useNumeric =
    numericFields.includes(field) && Boolean(adapter.getNumericValue);

  indices.sort((displayA, displayB) => {
    const sourceA = baseDisplayToSource(displayA);
    const sourceB = baseDisplayToSource(displayB);
    const cmp = useNumeric
      ? compareNumeric(
          adapter.getNumericValue!(sourceA, field),
          adapter.getNumericValue!(sourceB, field),
        )
      : compareCellValues(
          adapter.getCellValue(sourceA, field),
          adapter.getCellValue(sourceB, field),
        );
    return direction === "asc" ? cmp : -cmp;
  });

  return indices;
}

export function formatColumnTitle(
  label: string,
  field: string,
  sort: SortState | null,
): string {
  if (sort?.field !== field) return label;
  return `${label} ${sort.direction === "asc" ? "▲" : "▼"}`;
}
