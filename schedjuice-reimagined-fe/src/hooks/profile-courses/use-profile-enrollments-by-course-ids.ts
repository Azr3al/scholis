"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export function useProfileEnrollmentsByCourseIds(
  subjectId: string,
  courseIds: number[],
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["profileEnrollmentsByCourseIds", subjectId, courseIds.join(",")],
    enabled: enabled && courseIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await searchEntities(
        "user-courses",
        {
          size: -1,
          expand: ["assigned_as_role", "course"],
        },
        {
          filter_params: [
            { field_name: "user_id", operator: operatorEnum.exact, value: subjectId },
            {
              field_name: "course_id",
              operator: operatorEnum.in,
              value: courseIds.join(","),
            },
          ],
        },
      );
      return res.data?.data ?? [];
    },
  });
}
