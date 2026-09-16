"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { AssignedAsRole } from "../_types/assigned-as-roles";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { assignedAsRolesSearch } from "../resources/assigned-as-roles";

export type UseAssignedAsRolesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useAssignedAsRolesList(
  args: UseAssignedAsRolesListArgs,
): ResourceListResult<AssignedAsRole> {
  return useSearchListQuery(assignedAsRolesSearch, args);
}
