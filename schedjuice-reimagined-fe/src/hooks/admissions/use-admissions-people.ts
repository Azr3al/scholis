"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import {
  buildAdmissionsPeopleFilterParams,
  type AdmissionsPeopleFilterState,
} from "@/helpers/admissions/people-filter-params";

export const ADMISSIONS_PEOPLE_PAGE_SIZE = 24;

const PEOPLE_FIELDS = [
  "id",
  "name",
  "alternative_name",
  "email",
  "phone_number",
  "is_active",
  "is_attending",
];

export type AdmissionsPersonRow = {
  id: number;
  name: string;
  alternative_name?: string | null;
  email: string;
  phone_number?: string | null;
  is_active: boolean;
  is_attending: boolean;
};

export interface AdmissionsPeopleResult {
  rows: AdmissionsPersonRow[];
  totalCount: number;
  pageCount: number;
}

export function useAdmissionsPeople({
  state,
}: {
  state: AdmissionsPeopleFilterState;
}) {
  return useQuery({
    queryKey: ["admissions-people-list", state],
    keepPreviousData: true,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<AdmissionsPeopleResult> => {
      const res = await searchEntities(
        "admissions/people",
        {
          page: state.page,
          size: ADMISSIONS_PEOPLE_PAGE_SIZE,
          sorts: ["name"],
          fields: PEOPLE_FIELDS,
          q: state.q || undefined,
          ...(state.tab === "students" && state.includeAlumni
            ? { include_alumni: true }
            : {}),
          ...(state.tab === "staff" && state.includeInactive
            ? { include_inactive: true }
            : {}),
        },
        buildAdmissionsPeopleFilterParams(state),
        { signal },
      );
      const payload = res.data ?? {};
      const rows = (payload.data ?? []) as AdmissionsPersonRow[];
      const totalCount = payload.count ?? rows.length;
      const pageCount = payload.total_pages ?? 1;
      return { rows, totalCount, pageCount };
    },
  });
}
