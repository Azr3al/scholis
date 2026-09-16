"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import {
  buildProfileCourseFilterParams,
  type ProfileCourseScope,
} from "@/helpers/profile-courses/build-profile-course-filter-params";
import { courseType } from "@/types/course";

export const PROFILE_COURSE_PAGE_SIZE = 10;

const EXPAND = [
  "program",
  "level",
  "section",
  "subject",
  "course_subjects",
  "course_subjects.subject",
];

export interface UseProfileCourseSearchArgs {
  subjectId: string;
  q: string;
  page: number;
  scope: ProfileCourseScope;
  sharedIds: number[];
  enabled?: boolean;
}

export interface ProfileCourseSearchResult {
  rows: courseType[];
  totalCount: number;
  totalPages: number;
  usedFallback: boolean;
}

export function useProfileCourseSearch({
  subjectId,
  q,
  page,
  scope,
  sharedIds,
  enabled = true,
}: UseProfileCourseSearchArgs) {
  const trimmed = q.trim();
  const scopeBlocksSearch = scope === "your" && sharedIds.length === 0;

  return useQuery({
    queryKey: [
      "profile-course-search",
      subjectId,
      trimmed,
      page,
      scope,
      sharedIds.join(","),
    ],
    enabled: enabled && trimmed.length > 0 && !scopeBlocksSearch,
    keepPreviousData: true,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<ProfileCourseSearchResult> => {
      const { filter_params } = buildProfileCourseFilterParams({
        subjectId,
        scope,
        sharedIds,
      });

      const res = await searchEntities(
        "courses",
        {
          page,
          size: PROFILE_COURSE_PAGE_SIZE,
          q: trimmed,
          sorts: ["-created_at"],
          expand: EXPAND,
        },
        { filter_params },
        { signal },
      );

      const payload = res.data ?? {};
      const rows = (payload.data ?? []) as courseType[];
      const totalCount = payload.count ?? rows.length;
      const totalPages =
        payload.total_pages ??
        Math.max(1, Math.ceil(totalCount / PROFILE_COURSE_PAGE_SIZE));

      return {
        rows,
        totalCount,
        totalPages,
        usedFallback: Boolean(payload.used_fallback),
      };
    },
  });
}
