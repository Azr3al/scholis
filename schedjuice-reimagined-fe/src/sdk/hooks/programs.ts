"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Program } from "../_types/programs";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { programsSearch } from "../resources/programs";

export type UseProgramsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useProgramsList(
  args: UseProgramsListArgs,
): ResourceListResult<Program> {
  return useSearchListQuery(programsSearch, args);
}
