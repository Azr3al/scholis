"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { CourseJoinRequest } from "../_types/course-join-requests";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { courseJoinRequestsSearch } from "../resources/course-join-requests";

export type UseCourseJoinRequestsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useCourseJoinRequestsList(
  args: UseCourseJoinRequestsListArgs,
): ResourceListResult<CourseJoinRequest> {
  return useSearchListQuery(courseJoinRequestsSearch, args);
}
