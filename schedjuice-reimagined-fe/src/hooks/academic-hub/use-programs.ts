"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export interface HubProgram {
  id: number;
  name: string;
  course_creation_method: "manual" | "intake_based";
  subject_strategy: "none" | "optional" | "required" | "multi";
  sort_order?: number;
  is_active: boolean;
  intake_count?: number;
}

export function useHubPrograms() {
  return useQuery({
    queryKey: ["academic-hub-programs"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<HubProgram[]> => {
      const res = await searchEntities(
        "programs",
        { page: 1, size: 100, sorts: ["name"] },
        {
          filter_params: [
            {
              field_name: "is_active",
              operator: operatorEnum.exact,
              value: "True",
            },
          ],
        },
      );
      return res.data?.data ?? [];
    },
  });
}
