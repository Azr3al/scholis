"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { UserDepartment } from "../_types/user-departments";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { userDepartmentsSearch } from "../resources/user-departments";

export type UseUserDepartmentsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useUserDepartmentsList(
  args: UseUserDepartmentsListArgs,
): ResourceListResult<UserDepartment> {
  return useSearchListQuery(userDepartmentsSearch, args);
}
