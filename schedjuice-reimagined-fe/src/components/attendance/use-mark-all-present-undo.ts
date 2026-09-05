"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_WINDOW_MS } from "@/components/record/inline/undo-core";
import {
  isMarkAllUndoVisible,
  type MarkAllPresentSnapshot,
} from "./mark-all-present-undo-core";

export function useMarkAllPresentUndo() {
  const [snapshot, setSnapshot] = useState<MarkAllPresentSnapshot | null>(null);
  const [offeredAt, setOfferedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setSnapshot(null);
    setOfferedAt(null);
  }, []);

  const offer = useCallback((nextSnapshot: MarkAllPresentSnapshot) => {
    if (nextSnapshot.size === 0) return;
    if (timerRef.current != null) clearTimeout(timerRef.current);
    setSnapshot(nextSnapshot);
    setOfferedAt(Date.now());
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setSnapshot(null);
      setOfferedAt(null);
    }, UNDO_WINDOW_MS);
  }, []);

  const undo = useCallback((): MarkAllPresentSnapshot | null => {
    if (snapshot == null || snapshot.size === 0) return null;
    const current = snapshot;
    clear();
    return current;
  }, [snapshot, clear]);

  useEffect(
    () => () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    },
    [],
  );

  const isVisible = isMarkAllUndoVisible(offeredAt);

  return { snapshot, isVisible, offer, undo, clear };
}
