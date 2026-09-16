"use client";

import { useCallback, useRef, useState } from "react";

import type { SheetAdapter } from "../types";
import {
  createHistoryState,
  invertTransaction,
  pushTransaction,
  type CellChange,
  type StructuralChange,
  type Transaction,
} from "../lib/history-core";

export interface PendingWrite {
  row: number;
  field: string;
  value: string;
}

export function useGridHistory(adapter: SheetAdapter) {
  const [state, setState] = useState(() => createHistoryState(100));
  // keep a live ref so callbacks always see the latest stacks
  const stateRef = useRef(state);
  stateRef.current = state;

  const applyTransaction = useCallback(
    (tx: Transaction) => {
      tx.structural?.forEach((s) => {
        if (s.kind === "append" && adapter.appendRows) {
          adapter.appendRows(s.rows.length);
        } else if (s.kind === "remove" && adapter.removeRows) {
          adapter.removeRows(s.rows);
        }
      });
      tx.cells.forEach((c) => adapter.setCellValue(c.row, c.field, c.after));
    },
    [adapter],
  );

  // Records writes (capturing before values) and pushes a single transaction.
  const commitWrites = useCallback(
    (writes: PendingWrite[], label: string, appendRows?: number[]) => {
      if (writes.length === 0 && !appendRows?.length) return;

      const structural: StructuralChange[] | undefined = appendRows?.length
        ? [{ kind: "append", rows: appendRows }]
        : undefined;

      if (structural) {
        structural.forEach((s) => {
          if (s.kind === "append" && adapter.appendRows) {
            adapter.appendRows(s.rows.length);
          }
        });
      }

      const cells: CellChange[] = writes.map((w) => {
        const before = adapter.getCellValue(w.row, w.field);
        return { row: w.row, field: w.field, before, after: w.value };
      });

      cells.forEach((c) => adapter.setCellValue(c.row, c.field, c.after));

      setState((prev) => pushTransaction(prev, { label, cells, structural }));
    },
    [adapter],
  );

  const undo = useCallback(() => {
    const prev = stateRef.current;
    const tx = prev.undo[prev.undo.length - 1];
    if (!tx) return;
    const inverted = invertTransaction(tx);
    applyTransaction(inverted);
    setState({
      ...prev,
      undo: prev.undo.slice(0, -1),
      redo: [...prev.redo, tx],
    });
  }, [applyTransaction]);

  const redo = useCallback(() => {
    const prev = stateRef.current;
    const tx = prev.redo[prev.redo.length - 1];
    if (!tx) return;
    applyTransaction(tx);
    setState({
      ...prev,
      redo: prev.redo.slice(0, -1),
      undo: [...prev.undo, tx],
    });
  }, [applyTransaction]);

  const reset = useCallback(() => setState(createHistoryState(100)), []);

  return {
    commitWrites,
    undo,
    redo,
    reset,
    canUndo: state.undo.length > 0,
    canRedo: state.redo.length > 0,
  };
}
