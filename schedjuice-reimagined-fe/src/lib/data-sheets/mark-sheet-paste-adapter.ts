import { useCallback, useMemo, useRef, useState } from "react";

import { parseTsv } from "@/components/data-sheet/lib/clipboard-tsv";
import type { SheetAdapter } from "@/components/data-sheet/types";

export const MARK_SHEET_PASTE_DEFAULT_COLS = 10;
export const MARK_SHEET_PASTE_DEFAULT_ROWS = 25;

type GridState = {
  cells: string[][];
  colCount: number;
};

type GridMutation =
  | { type: "set"; row: number; col: number; value: string }
  | { type: "append"; count: number };

export function columnLetter(index: number): string {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export function markSheetPasteFieldKey(col: number): string {
  return `col-${col}`;
}

function blankRow(colCount: number): string[] {
  return Array.from({ length: colCount }, () => "");
}

function createInitialGrid(rows: number, cols: number): GridState {
  return {
    cells: Array.from({ length: rows }, () => blankRow(cols)),
    colCount: cols,
  };
}

function applyMutations(state: GridState, mutations: GridMutation[]): GridState {
  if (mutations.length === 0) return state;

  let { colCount } = state;
  const nextCells = state.cells.map((row) => [...row]);

  for (const mutation of mutations) {
    if (mutation.type === "append") {
      for (let i = 0; i < mutation.count; i++) {
        nextCells.push(blankRow(colCount));
      }
      continue;
    }

    const { row, col, value } = mutation;
    colCount = Math.max(colCount, col + 1);
    while (nextCells.length <= row) {
      nextCells.push(blankRow(colCount));
    }
    while (nextCells[row].length < colCount) {
      nextCells[row].push("");
    }
    nextCells[row][col] = value;
  }

  for (let i = 0; i < nextCells.length; i++) {
    while (nextCells[i].length < colCount) {
      nextCells[i].push("");
    }
  }

  return { cells: nextCells, colCount };
}

export function useMarkSheetPasteGrid(
  initialRows = MARK_SHEET_PASTE_DEFAULT_ROWS,
  initialCols = MARK_SHEET_PASTE_DEFAULT_COLS,
) {
  const [grid, setGrid] = useState<GridState>(() =>
    createInitialGrid(initialRows, initialCols),
  );
  const gridRef = useRef(grid);
  gridRef.current = grid;

  const mutationQueueRef = useRef<GridMutation[]>([]);
  const flushScheduledRef = useRef(false);

  const flushMutations = useCallback(() => {
    flushScheduledRef.current = false;
    const mutations = mutationQueueRef.current;
    mutationQueueRef.current = [];
    if (mutations.length === 0) return;

    setGrid((prev) => {
      const next = applyMutations(prev, mutations);
      gridRef.current = next;
      return next;
    });
  }, []);

  const enqueueMutation = useCallback(
    (mutation: GridMutation) => {
      mutationQueueRef.current.push(mutation);
      if (!flushScheduledRef.current) {
        flushScheduledRef.current = true;
        queueMicrotask(flushMutations);
      }
    },
    [flushMutations],
  );

  const setCellValue = useCallback(
    (row: number, col: number, value: string) => {
      enqueueMutation({ type: "set", row, col, value });
    },
    [enqueueMutation],
  );

  const appendRows = useCallback(
    (count: number) => {
      const startIndex = gridRef.current.cells.length;
      enqueueMutation({ type: "append", count });
      return Array.from({ length: count }, (_, i) => startIndex + i);
    },
    [enqueueMutation],
  );

  const applyPasteBlock = useCallback(
    (block: string[][], anchorRow: number, anchorCol: number) => {
      const mutations: GridMutation[] = [];
      for (let r = 0; r < block.length; r++) {
        const sourceRow = block[r] ?? [];
        for (let c = 0; c < sourceRow.length; c++) {
          mutations.push({
            type: "set",
            row: anchorRow + r,
            col: anchorCol + c,
            value: sourceRow[c] ?? "",
          });
        }
      }
      if (mutations.length === 0) return;
      setGrid((prev) => {
        const next = applyMutations(prev, mutations);
        gridRef.current = next;
        return next;
      });
    },
    [],
  );

  const applyPasteFromText = useCallback(
    (text: string, anchorRow: number, anchorCol: number) => {
      const block = parseTsv(text);
      if (block.length === 0) return false;
      applyPasteBlock(block, anchorRow, anchorCol);
      return true;
    },
    [applyPasteBlock],
  );

  const { cells, colCount } = grid;

  const adapter = useMemo<SheetAdapter>(
    () => ({
      rowCount: cells.length,
      getCellValue: (row, field) => {
        const col = Number(field.replace("col-", ""));
        if (!Number.isFinite(col)) return "";
        return gridRef.current.cells[row]?.[col] ?? "";
      },
      setCellValue: (row, field, value) => {
        const col = Number(field.replace("col-", ""));
        if (!Number.isFinite(col)) return;
        setCellValue(row, col, value);
      },
      isCellEditable: () => true,
      appendRows,
    }),
    [appendRows, cells.length, setCellValue],
  );

  const columns = useMemo(
    () =>
      Array.from({ length: colCount }, (_, i) => ({
        id: markSheetPasteFieldKey(i),
        title: columnLetter(i),
        width: 120,
      })),
    [colCount],
  );

  const fieldByColumn = useMemo(
    () => columns.map((col) => col.id),
    [columns],
  );

  return {
    adapter,
    cells,
    colCount,
    columns,
    fieldByColumn,
    applyPasteBlock,
    applyPasteFromText,
  };
}
