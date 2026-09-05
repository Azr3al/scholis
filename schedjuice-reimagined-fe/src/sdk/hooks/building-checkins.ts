"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { BuildingCheckin } from "../_types/building-checkins";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { buildingCheckinsSearch } from "../resources/building-checkins";

export type UseBuildingCheckinsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useBuildingCheckinsList(
  args: UseBuildingCheckinsListArgs,
): ResourceListResult<BuildingCheckin> {
  return useSearchListQuery(buildingCheckinsSearch, args);
}
