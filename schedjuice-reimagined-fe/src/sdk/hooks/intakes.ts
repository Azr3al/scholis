"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Intake } from "../_types/intakes";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { intakesSearch } from "../resources/intakes";

export type UseIntakesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useIntakesList(
  args: UseIntakesListArgs,
): ResourceListResult<Intake> {
  return useSearchListQuery(intakesSearch, args);
}
