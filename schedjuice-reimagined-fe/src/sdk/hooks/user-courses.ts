"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { UserCourse } from "../_types/user-courses";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { userCoursesSearch } from "../resources/user-courses";

export type UseUserCoursesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useUserCoursesList(
  args: UseUserCoursesListArgs,
): ResourceListResult<UserCourse> {
  return useSearchListQuery(userCoursesSearch, args);
}
