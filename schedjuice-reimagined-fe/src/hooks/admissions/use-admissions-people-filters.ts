"use client";

import { useCallback, useMemo } from "react";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import type { AdmissionsPeopleFilterState } from "@/helpers/admissions/people-filter-params";
import type { UserHubTab } from "@/types/user-hub";

const parsers = {
  tab: parseAsStringEnum<UserHubTab>(["staff", "students"]).withDefault(
    "students",
  ),
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  includeInactive: parseAsBoolean.withDefault(false),
  includeAlumni: parseAsBoolean.withDefault(false),
};

export function useAdmissionsPeopleFilters() {
  const [raw, setRaw] = useQueryStates(parsers, { history: "replace" });

  const state: AdmissionsPeopleFilterState = useMemo(
    () => ({
      tab: raw.tab ?? "students",
      q: raw.q ?? "",
      page: raw.page ?? 1,
      includeInactive: Boolean(raw.includeInactive),
      includeAlumni: Boolean(raw.includeAlumni),
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
  const setIncludeAlumni = useCallback(
    (includeAlumni: boolean) => setRaw({ includeAlumni, page: 1 }),
    [setRaw],
  );

  return {
    state,
    setTab,
    setQ,
    setPage,
    setIncludeInactive,
    setIncludeAlumni,
  };
}
