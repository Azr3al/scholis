"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { courseStatus, seniorityEnum } from "@/types/course";

export function useProfileTeachingCount(subjectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["profileTeachingCount", subjectId],
    enabled: enabled && Boolean(subjectId),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await searchEntities(
        "user-courses",
        { page: 1, size: 1 },
        {
          filter_params: [
            { field_name: "user_id", operator: operatorEnum.exact, value: String(subjectId) },
            {
              field_name: "assigned_as_role__seniority",
              operator: operatorEnum.in,
              value: [seniorityEnum.MAIN_TEACHER, seniorityEnum.ASSISTANT_TEACHER].join(","),
            },
            {
              field_name: "course__status",
              operator: operatorEnum.in,
              value: [courseStatus.active, courseStatus.planned].join(","),
            },
          ],
        },
      );
      const count = res.data?.count ?? 0;
      return count > 0 ? count : null;
    },
  });
}
