"use client";

import { useCallback, useState } from "react";

export function usePendingEdits<TEdit extends Record<string, any>>() {
  const [pendingEdits, setPendingEdits] = useState<Record<string, Partial<TEdit>>>(
    {}
  );

  const setPending = useCallback((id: string | number, patch: Partial<TEdit>) => {
    const key = String(id);
    setPendingEdits((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...patch,
      },
    }));
  }, []);

  const clearPending = useCallback(() => {
    setPendingEdits({});
  }, []);

  return { pendingEdits, setPending, clearPending, setPendingEdits };
}
