"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCourseSearch } from "@/app/client-api/course-search";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  type CourseScope,
  EMPTY_COURSE_SCOPE,
  scopeKey,
} from "@/lib/imports/course-scope";

export function useCourseSearch(
  q: string,
  page: number,
  scope: CourseScope = EMPTY_COURSE_SCOPE,
) {
  const debounced = useDebouncedValue(q, 200);

  return useQuery({
    queryKey: ["course-search", debounced, page, scopeKey(scope)],
    queryFn: ({ signal }) => fetchCourseSearch(debounced, page, signal, scope),
    enabled: debounced.trim().length >= 2,
    staleTime: 30_000,
    keepPreviousData: true,
  });
}
