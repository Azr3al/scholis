"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { UserEvent } from "../_types/user-events";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { userEventsSearch } from "../resources/user-events";

export type UseUserEventsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useUserEventsList(
  args: UseUserEventsListArgs,
): ResourceListResult<UserEvent> {
  return useSearchListQuery(userEventsSearch, args);
}
