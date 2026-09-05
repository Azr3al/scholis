"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { UserAttendance } from "../_types/user-attendances";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { userAttendancesSearch } from "../resources/user-attendances";

export type UseUserAttendancesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useUserAttendancesList(
  args: UseUserAttendancesListArgs,
): ResourceListResult<UserAttendance> {
  return useSearchListQuery(userAttendancesSearch, args);
}
