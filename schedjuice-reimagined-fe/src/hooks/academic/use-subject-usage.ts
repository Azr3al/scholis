"use client";

import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import {
  SubjectUsageResponse,
  subjectUsageResponseSchema,
} from "@/types/subject-usage";
import { filterParam } from "@/types/api";

interface UseSubjectUsageArgs {
  includeAllCourses?: boolean;
  filterParams?: filterParam[];
  q?: string;
  enabled?: boolean;
}

export function useSubjectUsage({
  includeAllCourses = false,
  filterParams = [],
  q,
  enabled = true,
}: UseSubjectUsageArgs = {}) {
  return useQuery({
    queryKey: ["academic-subject-usage", includeAllCourses, filterParams, q ?? ""],
    enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SubjectUsageResponse> => {
      const res = await axiosClient.post("courses/subject-usage", {
        filter_params: filterParams,
        include_all_courses: includeAllCourses,
        q: q || undefined,
      });
      const raw = res.data?.data ?? res.data;
      return subjectUsageResponseSchema.parse(raw);
    },
  });
}
