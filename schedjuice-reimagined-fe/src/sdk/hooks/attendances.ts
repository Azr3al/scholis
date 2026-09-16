"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Attendance } from "../_types/attendances";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { attendancesSearch } from "../resources/attendances";

export type UseAttendancesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useAttendancesList(
  args: UseAttendancesListArgs,
): ResourceListResult<Attendance> {
  return useSearchListQuery(attendancesSearch, args);
}
