"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { viewerTeachingCourseIds } from "@/helpers/record-academic/shared-courses";
import { operatorEnum } from "@/types/api";

export const VIEWER_TEACHING_COURSE_IDS_KEY = "viewerTeachingCourseIds";

export function useViewerTeachingCourseIds(viewerId: number | undefined) {
  return useQuery({
    queryKey: [VIEWER_TEACHING_COURSE_IDS_KEY, viewerId],
    enabled: Boolean(viewerId),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await searchEntities(
        "user-courses",
        {
          size: -1,
          expand: ["assigned_as_role", "course"],
          fields: ["course_id", "assigned_as_role.seniority", "course.status"],
        },
        {
          filter_params: [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: String(viewerId),
            },
          ],
        },
      );
      return viewerTeachingCourseIds(res.data?.data ?? []);
    },
  });
}
