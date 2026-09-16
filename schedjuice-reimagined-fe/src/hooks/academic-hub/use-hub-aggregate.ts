"use client";

import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import {
  HubAggregateRequest,
  HubAggregateResponse,
  HubFacet,
  HubFilterSet,
  hubAggregateResponseSchema,
} from "@/types/academic-hub";
import { buildHubFilterParams } from "@/helpers/academic-hub/filter-params";

interface UseHubAggregateArgs {
  facet: HubFacet;
  state: HubFilterSet;
  userId: number | string;
  enabled?: boolean;
}

function stripFacet(state: HubFilterSet, facet: HubFacet): HubFilterSet {
  if (facet === "status") return { ...state, status: [] };
  if (facet === "subject") return { ...state, subjects: [] };
  if (facet === "category") return { ...state, categories: [] };
  return state;
}

export function useHubAggregate({
  facet,
  state,
  userId,
  enabled = true,
}: UseHubAggregateArgs) {
  const strippedState = stripFacet(state, facet);

  return useQuery({
    queryKey: ["academic-hub-aggregate", facet, strippedState, userId],
    enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<HubAggregateResponse> => {
      const fp = buildHubFilterParams(strippedState, { userId });
      const body: HubAggregateRequest = {
        filter_params: fp.filter_params,
        q: state.q || undefined,
        facets: [facet],
      };
      const res = await axiosClient.post("courses/aggregate", body);
      const raw = res.data?.data ?? res.data;
      return hubAggregateResponseSchema.parse(raw);
    },
  });
}
