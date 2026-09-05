"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import {
  buildUserCourseFilterParams,
  type UserCourseListScope,
  type UserCourseListStatus,
} from "@/helpers/profile-courses/build-user-course-filter-params";
import { PROFILE_COURSE_PAGE_SIZE } from "@/hooks/profile-courses/use-profile-course-search";

const EXPAND = [
  "assigned_as_role",
  "course",
  "course.program",
  "course.level",
  "course.section",
  "course.subject",
  "course.course_subjects",
  "course.course_subjects.subject",
];

export function useProfileCourseList(args: {
  subjectId: string;
  page: number;
  scope: UserCourseListScope;
  status: UserCourseListStatus;
  viewerTeachingCourseIds: number[];
  enabled?: boolean;
}) {
  const scopeBlocks =
    args.scope === "your" && args.viewerTeachingCourseIds.length === 0;

  return useQuery({
    queryKey: [
      "profileCourseList",
      args.subjectId,
      args.page,
      args.scope,
      args.status,
      args.viewerTeachingCourseIds.join(","),
    ],
    enabled: (args.enabled ?? true) && !scopeBlocks,
    keepPreviousData: true,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { filter_params } = buildUserCourseFilterParams({
        subjectId: args.subjectId,
        scope: args.scope,
        status: args.status,
        viewerTeachingCourseIds: args.viewerTeachingCourseIds,
      });

      const res = await searchEntities(
        "user-courses",
        {
          page: args.page,
          size: PROFILE_COURSE_PAGE_SIZE,
          expand: EXPAND,
          teacher_roster_order: true,
        },
        { filter_params },
        { signal },
      );

      const rows = res.data?.data ?? [];
      const totalCount = res.data?.count ?? rows.length;
      const totalPages =
        res.data?.total_pages ??
        Math.max(1, Math.ceil(totalCount / PROFILE_COURSE_PAGE_SIZE));

      return { rows, totalCount, totalPages };
    },
  });
}
