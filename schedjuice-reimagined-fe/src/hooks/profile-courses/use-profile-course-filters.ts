"use client";

import { useCallback, useMemo } from "react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";

const parsers = {
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
};

export function useProfileCourseFilters() {
  const [raw, setRaw] = useQueryStates(parsers, { history: "replace" });

  const state = useMemo(
    () => ({
      q: raw.q ?? "",
      page: raw.page ?? 1,
    }),
    [raw],
  );

  const setQ = useCallback((q: string) => setRaw({ q, page: 1 }), [setRaw]);
  const setPage = useCallback((page: number) => setRaw({ page }), [setRaw]);
  const clearQ = useCallback(() => setRaw({ q: "", page: 1 }), [setRaw]);

  return { state, setQ, setPage, clearQ };
}
