"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export interface HubIntake {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  program: number;
}

export function useHubIntakes(programId: string | null) {
  return useQuery({
    queryKey: ["academic-hub-intakes", programId],
    enabled: Boolean(programId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<HubIntake[]> => {
      const res = await searchEntities(
        "intakes",
        { page: 1, size: 100, sorts: ["-start_date"] },
        {
          filter_params: [
            {
              field_name: "program",
              operator: operatorEnum.exact,
              value: String(programId),
            },
          ],
        },
      );
      return res.data?.data ?? [];
    },
  });
}
