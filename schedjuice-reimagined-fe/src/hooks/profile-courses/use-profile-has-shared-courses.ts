"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export function useProfileHasSharedCourses(
  subjectId: string | undefined,
  viewerTeachingCourseIds: number[],
  enabled = true,
) {
  return useQuery({
    queryKey: ["profileHasSharedCourses", subjectId, viewerTeachingCourseIds.join(",")],
    enabled: enabled && Boolean(subjectId) && viewerTeachingCourseIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await searchEntities(
        "user-courses",
        { page: 1, size: 1 },
        {
          filter_params: [
            { field_name: "user_id", operator: operatorEnum.exact, value: String(subjectId) },
            {
              field_name: "course_id",
              operator: operatorEnum.in,
              value: viewerTeachingCourseIds.join(","),
            },
          ],
        },
      );
      return (res.data?.count ?? 0) > 0;
    },
  });
}
