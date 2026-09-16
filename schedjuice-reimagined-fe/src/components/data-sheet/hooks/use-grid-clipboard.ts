"use client";

import { useCallback } from "react";

import type { SheetAdapter } from "../types";
import { parseTsv, serializeHtmlTable, serializeTsv } from "../lib/clipboard-tsv";
import { planPaste } from "../lib/smart-paste";
import type { PendingWrite } from "./use-grid-history";

export interface SelectionRange {
  // display coordinates
  rowStart: number;
  rowEnd: number; // inclusive
  colStart: number;
  colEnd: number; // inclusive
  anchor: { row: number; col: number };
}

export interface ClipboardDeps {
  adapter: SheetAdapter;
  visibleFields: (string | null)[]; // aligned to grid columns; null = non-data column
  displayToSource: (displayRow: number) => number;
  getSelectionRange: () => SelectionRange | null;
  commitWrites: (
    writes: PendingWrite[],
    label: string,
    appendRows?: number[],
  ) => void;
  canGrow: boolean;
}

const MAX_PASTE_CELLS = 100_000;

export function useGridClipboard({
  adapter,
  visibleFields,
  displayToSource,
  getSelectionRange,
  commitWrites,
  canGrow,
}: ClipboardDeps) {
  const buildMatrix = useCallback(
    (range: SelectionRange) => {
      const out: string[][] = [];
      for (let r = range.rowStart; r <= range.rowEnd; r++) {
        const row: string[] = [];
        for (let c = range.colStart; c <= range.colEnd; c++) {
          const field = visibleFields[c];
          row.push(
            field ? adapter.getCellValue(displayToSource(r), field) : "",
          );
        }
        out.push(row);
      }
      return out;
    },
    [adapter, visibleFields, displayToSource],
  );

  const writeClipboard = useCallback(async (matrix: string[][]) => {
    const tsv = serializeTsv(matrix);
    try {
      if (
        typeof ClipboardItem !== "undefined" &&
        navigator.clipboard &&
        "write" in navigator.clipboard
      ) {
        const item = new ClipboardItem({
          "text/plain": new Blob([tsv], { type: "text/plain" }),
          "text/html": new Blob([serializeHtmlTable(matrix)], {
            type: "text/html",
          }),
        });
        await navigator.clipboard.write([item]);
        return;
      }
    } catch {
      // fall through to plain text
    }
    await navigator.clipboard.writeText(tsv);
  }, []);

  const copySelection = useCallback(async () => {
    const range = getSelectionRange();
    if (!range) return;
    await writeClipboard(buildMatrix(range));
  }, [getSelectionRange, buildMatrix, writeClipboard]);

  const cutSelection = useCallback(async () => {
    const range = getSelectionRange();
    if (!range) return;
    await writeClipboard(buildMatrix(range));

    const writes: PendingWrite[] = [];
    for (let r = range.rowStart; r <= range.rowEnd; r++) {
      const source = displayToSource(r);
      for (let c = range.colStart; c <= range.colEnd; c++) {
        const field = visibleFields[c];
        if (field && adapter.isCellEditable(source, field)) {
          writes.push({ row: source, field, value: "" });
        }
      }
    }
    commitWrites(writes, "Cut");
  }, [
    getSelectionRange,
    buildMatrix,
    writeClipboard,
    visibleFields,
    adapter,
    displayToSource,
    commitWrites,
  ]);

  const paste = useCallback(async () => {
    const range = getSelectionRange();
    if (!range) return;

    const text = await navigator.clipboard.readText();
    if (!text) return;

    const block = parseTsv(text);
    if (block.length === 0) return;
    if (block.length * (block[0]?.length ?? 0) > MAX_PASTE_CELLS) return;

    const plan = planPaste({
      block,
      fields: visibleFields,
      anchor: range.anchor,
      selection: {
        rows: range.rowEnd - range.rowStart + 1,
        cols: range.colEnd - range.colStart + 1,
      },
      rowCount: adapter.rowCount,
      canGrow: canGrow && Boolean(adapter.appendRows),
      isEditable: (displayRow, field) =>
        adapter.isCellEditable(displayToSource(displayRow), field),
    });

    const appendRows =
      plan.appendCount > 0 && adapter.appendRows
        ? Array.from(
            { length: plan.appendCount },
            (_, i) => adapter.rowCount + i,
          )
        : undefined;

    const writes: PendingWrite[] = plan.writes.map((w) => ({
      row: displayToSource(w.row),
      field: w.field,
      value: w.value,
    }));

    commitWrites(writes, "Paste", appendRows);
  }, [
    getSelectionRange,
    visibleFields,
    adapter,
    canGrow,
    displayToSource,
    commitWrites,
  ]);

  return { copySelection, cutSelection, paste };
}
