"use client";

import { useCallback, useMemo } from "react";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { UserHubFilterSet, UserHubTab, UserHubViewMode } from "@/types/user-hub";

const parsers = {
  tab: parseAsStringEnum<UserHubTab>(["staff", "students"]).withDefault("staff"),
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  includeInactive: parseAsBoolean.withDefault(false),
  incomplete: parseAsBoolean.withDefault(false),
  view: parseAsStringEnum<UserHubViewMode>(["grid", "list"]).withDefault("grid"),
};

export function useHubUserFilters() {
  const [raw, setRaw] = useQueryStates(parsers, { history: "replace" });

  const state: UserHubFilterSet = useMemo(
    () => ({
      tab: raw.tab ?? "staff",
      q: raw.q ?? "",
      page: raw.page ?? 1,
      includeInactive: Boolean(raw.includeInactive),
      incomplete: Boolean(raw.incomplete),
      view: raw.view ?? "grid",
    }),
    [raw],
  );

  const setTab = useCallback(
    (tab: UserHubTab) => setRaw({ tab, page: 1 }),
    [setRaw],
  );
  const setQ = useCallback((q: string) => setRaw({ q, page: 1 }), [setRaw]);
  const setPage = useCallback((page: number) => setRaw({ page }), [setRaw]);
  const setIncludeInactive = useCallback(
    (includeInactive: boolean) => setRaw({ includeInactive, page: 1 }),
    [setRaw],
  );
  const setIncomplete = useCallback(
    (incomplete: boolean) => setRaw({ incomplete, page: 1 }),
    [setRaw],
  );
  const setView = useCallback(
    (view: UserHubViewMode) => setRaw({ view }),
    [setRaw],
  );

  return {
    state,
    setTab,
    setQ,
    setPage,
    setIncludeInactive,
    setIncomplete,
    setView,
  };
}
