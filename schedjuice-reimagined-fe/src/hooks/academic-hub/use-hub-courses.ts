"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { buildHubFilterParams } from "@/helpers/academic-hub/filter-params";
import { HubFilterSet, HubStatusAggregate } from "@/types/academic-hub";
import { HubProgram } from "./use-programs";
import { courseType } from "@/types/course";

export const ACADEMIC_HUB_PAGE_SIZE = 24;

const EXPAND = [
  "category",
  "subject",
  "level",
  "section",
  "program",
  "intake",
  "course_subjects",
  "course_subjects.subject",
  "created_by",
];

function pickSorts(
  state: HubFilterSet,
  program: HubProgram | undefined,
): string[] {
  if (program?.course_creation_method === "intake_based") {
    return ["-intake__start_date", "-created_at"];
  }
  return ["-created_at"];
}

export interface UseHubCoursesArgs {
  state: HubFilterSet;
  userId: number | string;
  program: HubProgram | undefined;
  enabled?: boolean;
}

export interface HubCoursesResult {
  rows: courseType[];
  totalCount: number;
  pageCount: number;
  statusCounts?: HubStatusAggregate;
}

export function useHubCourses({
  state,
  userId,
  program,
  enabled = true,
}: UseHubCoursesArgs) {
  return useQuery({
    queryKey: ["academic-hub-list", state, userId],
    enabled: enabled && Boolean(userId),
    keepPreviousData: true,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<HubCoursesResult> => {
      const filterParams = buildHubFilterParams(state, { userId });
      const res = await searchEntities(
        "courses",
        {
          page: state.page,
          size: ACADEMIC_HUB_PAGE_SIZE,
          sorts: pickSorts(state, program),
          expand: EXPAND,
          q: state.q || undefined,
        },
        {
          ...filterParams,
          facets: ["status"],
        },
        { signal },
      );
      const payload = res.data ?? {};
      const rows = (payload.data ?? []) as courseType[];
      const totalCount = payload.count ?? rows.length;
      const pageCount = payload.total_pages ?? 1;
      const statusCounts = payload.facets?.status as
        | HubStatusAggregate
        | undefined;
      return { rows, totalCount, pageCount, statusCounts };
    },
  });
}
