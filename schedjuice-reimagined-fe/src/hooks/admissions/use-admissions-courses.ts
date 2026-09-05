"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { buildHubFilterParams } from "@/helpers/academic-hub/filter-params";
import { ACADEMIC_HUB_PAGE_SIZE } from "@/hooks/academic-hub/use-hub-courses";
import type { HubFilterSet } from "@/types/academic-hub";

export type AdmissionsCourseRow = {
  id: number;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
  current_unit?: number | null;
  current_unit_updated_at?: string | null;
};

export interface AdmissionsCoursesResult {
  rows: AdmissionsCourseRow[];
  totalCount: number;
  pageCount: number;
}

export function useAdmissionsCourses({ state }: { state: HubFilterSet }) {
  return useQuery({
    queryKey: ["admissions-courses-list", state],
    keepPreviousData: true,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<AdmissionsCoursesResult> => {
      const filterParams = buildHubFilterParams(
        {
          ...state,
          my: false,
          intake: null,
          subjects: [],
          categories: [],
        },
        { userId: 0 },
      );
      const res = await searchEntities(
        "admissions/courses",
        {
          page: state.page,
          size: ACADEMIC_HUB_PAGE_SIZE,
          sorts: ["-created_at"],
          q: state.q || undefined,
        },
        filterParams,
        { signal },
      );
      const payload = res.data ?? {};
      const rows = (payload.data ?? []) as AdmissionsCourseRow[];
      const totalCount = payload.count ?? rows.length;
      const pageCount = payload.total_pages ?? 1;
      return { rows, totalCount, pageCount };
    },
  });
}
