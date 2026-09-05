"use client";

import { useCallback, useMemo } from "react";
import {
  parseAsInteger,
  parseAsString,
  parseAsArrayOf,
  parseAsBoolean,
  useQueryStates,
} from "nuqs";
import {
  HUB_PROGRAM_ALL,
  HUB_STATUS_VALUES,
  HubFilterSet,
  HubStatusFilter,
} from "@/types/academic-hub";

const parsers = {
  program: parseAsString.withDefault(HUB_PROGRAM_ALL),
  status: parseAsArrayOf(parseAsString).withDefault(["active"]),
  intake: parseAsString,
  subjects: parseAsArrayOf(parseAsString).withDefault([]),
  categories: parseAsArrayOf(parseAsString).withDefault([]),
  q: parseAsString.withDefault(""),
  // No `withDefault` here: we need to tell "URL absent" (apply teacher default)
  // apart from "URL explicitly false" (user opted out). See `isMyExplicit` below.
  my: parseAsBoolean,
  page: parseAsInteger.withDefault(1),
};

export function useHubFilters() {
  const [raw, setRaw] = useQueryStates(parsers, { history: "replace" });

  const isMyExplicit = raw.my !== null && raw.my !== undefined;

  const state: HubFilterSet = useMemo(
    () => ({
      program: raw.program ?? HUB_PROGRAM_ALL,
      status: ((raw.status ?? []).filter((s): s is HubStatusFilter =>
        HUB_STATUS_VALUES.includes(s as HubStatusFilter),
      )) as HubStatusFilter[],
      intake: raw.intake ?? null,
      subjects: (raw.subjects ?? []).filter(Boolean),
      categories: (raw.categories ?? []).filter(Boolean),
      q: raw.q ?? "",
      my: Boolean(raw.my),
      page: raw.page ?? 1,
    }),
    [raw],
  );

  const setProgram = useCallback(
    (program: string, options?: { resetFilters?: boolean }) => {
      const programScoped = {
        program,
        intake: null,
        subjects: [],
        categories: [],
        page: 1,
      };
      if (options?.resetFilters ?? true) {
        setRaw({
          ...programScoped,
          status: ["active"],
          q: "",
        });
      } else {
        setRaw(programScoped);
      }
    },
    [setRaw],
  );

  const setStatus = useCallback(
    (status: HubStatusFilter[]) => setRaw({ status }),
    [setRaw],
  );
  const setIntake = useCallback(
    (intake: string | null) => setRaw({ intake, page: 1 }),
    [setRaw],
  );
  const setSubjects = useCallback(
    (subjects: string[]) => setRaw({ subjects, page: 1 }),
    [setRaw],
  );
  const setCategories = useCallback(
    (categories: string[]) => setRaw({ categories, page: 1 }),
    [setRaw],
  );
  const setQ = useCallback((q: string) => setRaw({ q, page: 1 }), [setRaw]);
  const setMy = useCallback((my: boolean) => setRaw({ my, page: 1 }), [setRaw]);
  const setPage = useCallback((page: number) => setRaw({ page }), [setRaw]);

  return {
    state,
    isMyExplicit,
    setProgram,
    setStatus,
    setIntake,
    setSubjects,
    setCategories,
    setQ,
    setMy,
    setPage,
  };
}
