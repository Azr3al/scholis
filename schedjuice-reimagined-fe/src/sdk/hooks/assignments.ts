"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Assignment } from "../_types/assignments";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { assignmentsSearch } from "../resources/assignments";

export type UseAssignmentsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useAssignmentsList(
  args: UseAssignmentsListArgs,
): ResourceListResult<Assignment> {
  return useSearchListQuery(assignmentsSearch, args);
}
