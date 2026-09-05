"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { courseStatus } from "@/types/course";

async function countUserCourses(
  filter_params: NonNullable<Parameters<typeof searchEntities>[2]>["filter_params"],
) {
  const res = await searchEntities("user-courses", { page: 1, size: 1 }, { filter_params });
  return res.data?.count ?? 0;
}

export function useProfileEnrollmentCounts(subjectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["profileEnrollmentCounts", subjectId],
    enabled: enabled && Boolean(subjectId),
    staleTime: 30_000,
    queryFn: async () => {
      const base = [
        { field_name: "user_id", operator: operatorEnum.exact, value: String(subjectId) },
      ];
      const [totalCount, activeCount] = await Promise.all([
        countUserCourses(base),
        countUserCourses([
          ...base,
          {
            field_name: "course__status",
            operator: operatorEnum.in,
            value: [courseStatus.active, courseStatus.planned].join(","),
          },
        ]),
      ]);
      return { totalCount, activeCount };
    },
  });
}
