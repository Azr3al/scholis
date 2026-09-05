import {
  resolveRowUserResolution,
  type CellResolution,
} from "@/lib/imports/resolution";

export type MarkSheetCommitRow = {
  student_id: number;
  marks: Record<string, number | string>;
};

export type BuildMarkSheetImportRowsInput = {
  rows: (string | number | null)[][];
  rowIds: string[];
  resolution: Map<string, CellResolution>;
  columnMapping: Record<string, number>;
  scoreColIndexByKey: Map<string, number>;
  scoreKeys: string[];
};

export type BuildMarkSheetImportRowsResult = {
  rows: MarkSheetCommitRow[];
  unresolvedRowIndexes: number[];
};

export function countUnresolvedMarkSheetRows(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  columnMapping: Record<string, number>,
): number {
  let count = 0;
  rowIds.forEach((rowId) => {
    const cell = resolveRowUserResolution(resolution, rowId, columnMapping);
    if (!cell) {
      count += 1;
      return;
    }
    if (
      cell.status === "pending_match" ||
      cell.status === "pending_candidates" ||
      cell.status === "new" ||
      cell.status === "idle"
    ) {
      count += 1;
    }
  });
  return count;
}

export function countUnmatchedMarkSheetRows(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  columnMapping: Record<string, number>,
): number {
  let count = 0;
  rowIds.forEach((rowId) => {
    const cell = resolveRowUserResolution(resolution, rowId, columnMapping);
    if (cell?.status === "new") count += 1;
  });
  return count;
}

export function buildMarkSheetImportRows(
  input: BuildMarkSheetImportRowsInput,
): BuildMarkSheetImportRowsResult {
  const {
    rows,
    rowIds,
    resolution,
    columnMapping,
    scoreColIndexByKey,
    scoreKeys,
  } = input;

  const commitRows: MarkSheetCommitRow[] = [];
  const unresolvedRowIndexes: number[] = [];

  rowIds.forEach((rowId, rowIndex) => {
    const cell = resolveRowUserResolution(resolution, rowId, columnMapping);
    if (!cell || cell.status === "ignored") {
      return;
    }

    const studentId = cell.confirmedUserId ?? cell.entityRef?.id ?? null;
    if (!studentId) {
      if (
        cell.status === "pending_match" ||
        cell.status === "pending_candidates" ||
        cell.status === "new" ||
        cell.status === "idle"
      ) {
        unresolvedRowIndexes.push(rowIndex);
      }
      return;
    }

    if (cell.status !== "confirmed") {
      unresolvedRowIndexes.push(rowIndex);
      return;
    }

    const row = rows[rowIndex] ?? [];
    const marks: Record<string, number | string> = {};
    for (const key of scoreKeys) {
      const colIndex = scoreColIndexByKey.get(key);
      if (colIndex == null || colIndex >= row.length) continue;
      const val = row[colIndex];
      if (val != null && String(val).trim() !== "") {
        marks[key] = val;
      }
    }

    commitRows.push({ student_id: studentId, marks });
  });

  return { rows: commitRows, unresolvedRowIndexes };
}

export function resolvedStudentId(
  resolution: Map<string, CellResolution>,
  rowId: string,
  columnMapping: Record<string, number>,
): number | null {
  const cell = resolveRowUserResolution(resolution, rowId, columnMapping);
  if (!cell || cell.status !== "confirmed") return null;
  return cell.confirmedUserId ?? cell.entityRef?.id ?? null;
}
