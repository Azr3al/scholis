"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { buildHubUserTabCountFilterParams } from "@/helpers/user-hub/filter-params";
import type { UserHubTab } from "@/types/user-hub";

export const ADMISSIONS_PEOPLE_TAB_COUNTS_KEY = [
  "admissions-people-tab-counts",
] as const;

export type AdmissionsPeopleTabCounts = Record<UserHubTab, number>;

async function fetchTabCount(
  tab: UserHubTab,
  signal?: AbortSignal,
): Promise<number> {
  const res = await searchEntities(
    "admissions/people",
    {
      page: 1,
      size: 1,
      sorts: ["name"],
      fields: ["id"],
    },
    buildHubUserTabCountFilterParams(tab),
    { signal },
  );
  const payload = res.data ?? {};
  const rows = payload.data ?? [];
  return payload.count ?? rows.length;
}

export function useAdmissionsPeopleTabCounts() {
  return useQuery({
    queryKey: ADMISSIONS_PEOPLE_TAB_COUNTS_KEY,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<AdmissionsPeopleTabCounts> => {
      const [staff, students] = await Promise.all([
        fetchTabCount("staff", signal),
        fetchTabCount("students", signal),
      ]);
      return { staff, students };
    },
  });
}
