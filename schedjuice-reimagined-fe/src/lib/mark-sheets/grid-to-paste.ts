import { serializeTsv } from "@/components/data-sheet/lib/clipboard-tsv";

function isRowEmpty(row: readonly string[]): boolean {
  return row.every((cell) => !cell.trim());
}

/** Drop trailing blank rows and columns from a paste grid. */
export function trimGridCells(cells: readonly string[][]): string[][] {
  if (cells.length === 0) return [];

  let lastRow = cells.length - 1;
  while (lastRow >= 0 && isRowEmpty(cells[lastRow] ?? [])) {
    lastRow -= 1;
  }
  if (lastRow < 0) return [];

  const trimmedRows = cells.slice(0, lastRow + 1);

  let lastCol = -1;
  for (const row of trimmedRows) {
    for (let c = row.length - 1; c > lastCol; c--) {
      if (row[c]?.trim()) {
        lastCol = c;
        break;
      }
    }
  }
  if (lastCol < 0) return [];

  return trimmedRows.map((row) =>
    Array.from({ length: lastCol + 1 }, (_, i) => row[i]?.trim() ?? ""),
  );
}

/** Serialize grid content as TSV for server parse, or null if insufficient data. */
export function gridToPastePayload(cells: readonly string[][]): string | null {
  const trimmed = trimGridCells(cells);
  if (trimmed.length < 2) return null;

  const hasDataRow = trimmed.slice(1).some((row) => row.some((cell) => cell.trim()));
  if (!hasDataRow) return null;

  return serializeTsv(trimmed);
}
