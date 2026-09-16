"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { UserEmail } from "../_types/user-emails";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { userEmailsSearch } from "../resources/user-emails";

export type UseUserEmailsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useUserEmailsList(
  args: UseUserEmailsListArgs,
): ResourceListResult<UserEmail> {
  return useSearchListQuery(userEmailsSearch, args);
}
