"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { buildHubUserTabCountFilterParams } from "@/helpers/user-hub/filter-params";
import { UserHubTab } from "@/types/user-hub";

export const USER_HUB_TAB_COUNTS_QUERY_KEY = ["user-hub-tab-counts"] as const;

const TAB_COUNT_FIELDS = ["id"];

export type HubUserTabCounts = Record<UserHubTab, number>;

async function fetchTabCount(
  tab: UserHubTab,
  signal?: AbortSignal,
): Promise<number> {
  const res = await searchEntities(
    "users",
    {
      page: 1,
      size: 1,
      sorts: ["name"],
      fields: TAB_COUNT_FIELDS,
    },
    buildHubUserTabCountFilterParams(tab),
    { signal },
  );
  const payload = res.data ?? {};
  const rows = payload.data ?? [];
  return payload.count ?? rows.length;
}

export function useHubUserTabCounts() {
  return useQuery({
    queryKey: USER_HUB_TAB_COUNTS_QUERY_KEY,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<HubUserTabCounts> => {
      const [staff, students] = await Promise.all([
        fetchTabCount("staff", signal),
        fetchTabCount("students", signal),
      ]);
      return { staff, students };
    },
  });
}
