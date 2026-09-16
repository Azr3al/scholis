"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_WINDOW_MS, makeUndoEntry, type UndoEntry } from "./undo-core";

/** Tracks the most recent undoable field change and auto-clears after the window. */
export function useUndo() {
  const [entry, setEntry] = useState<UndoEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setEntry(null);
  }, []);

  const offer = useCallback((field: string, previousValue: unknown) => {
    if (timer.current) clearTimeout(timer.current);
    setEntry(makeUndoEntry(field, previousValue));
    timer.current = setTimeout(() => setEntry(null), UNDO_WINDOW_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { entry, offer, clear };
}
