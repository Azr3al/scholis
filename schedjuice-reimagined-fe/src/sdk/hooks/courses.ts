"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Course } from "../_types/courses";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { coursesSearch } from "../resources/courses";

export type UseCoursesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useCoursesList(
  args: UseCoursesListArgs,
): ResourceListResult<Course> {
  return useSearchListQuery(coursesSearch, args);
}
