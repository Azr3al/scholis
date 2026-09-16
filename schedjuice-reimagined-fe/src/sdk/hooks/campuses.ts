"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Campus } from "../_types/campuses";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { campusesSearch } from "../resources/campuses";

export type UseCampusesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useCampusesList(
  args: UseCampusesListArgs,
): ResourceListResult<Campus> {
  return useSearchListQuery(campusesSearch, args);
}
