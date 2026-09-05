"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { User } from "../_types/users";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { usersSearch } from "../resources/users";

export type UseUsersListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useUsersList(
  args: UseUsersListArgs,
): ResourceListResult<User> {
  return useSearchListQuery(usersSearch, args);
}
