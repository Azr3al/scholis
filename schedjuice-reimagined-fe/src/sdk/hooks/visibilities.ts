"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Visibility } from "../_types/visibilities";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { visibilitiesSearch } from "../resources/visibilities";

export type UseVisibilitiesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useVisibilitiesList(
  args: UseVisibilitiesListArgs,
): ResourceListResult<Visibility> {
  return useSearchListQuery(visibilitiesSearch, args);
}
