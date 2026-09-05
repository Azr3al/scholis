"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { buildHubUserFilterParams } from "@/helpers/user-hub/filter-params";
import { HubUserRow, UserHubFilterSet } from "@/types/user-hub";

export const USER_HUB_PAGE_SIZE = 24;

const HUB_FIELDS = [
  "id",
  "name",
  "alternative_name",
  "email",
  "phone_number",
  "roles",
  "is_active",
  "profile_image",
  "profile_completeness",
  "created_at",
];

export interface HubUsersResult {
  rows: HubUserRow[];
  totalCount: number;
  pageCount: number;
}

export function useHubUsers({ state }: { state: UserHubFilterSet }) {
  return useQuery({
    queryKey: ["user-hub-list", state],
    keepPreviousData: true,
    staleTime: 30_000,
    queryFn: async ({
      signal,
    }: {
      signal?: AbortSignal;
    }): Promise<HubUsersResult> => {
      const filterParams = buildHubUserFilterParams(state);
      const res = await searchEntities(
        "users",
        {
          page: state.page,
          size: USER_HUB_PAGE_SIZE,
          sorts: ["name"],
          fields: HUB_FIELDS,
          q: state.q || undefined,
          ...(state.includeInactive ? { include_inactive: true } : {}),
        },
        filterParams,
        { signal },
      );
      const payload = res.data ?? {};
      const rows = (payload.data ?? []) as HubUserRow[];
      const totalCount = payload.count ?? rows.length;
      const pageCount = payload.total_pages ?? 1;
      return { rows, totalCount, pageCount };
    },
  });
}
