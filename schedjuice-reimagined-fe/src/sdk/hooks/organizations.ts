"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Organization } from "../_types/organizations";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { organizationsSearch } from "../resources/organizations";

export type UseOrganizationsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useOrganizationsList(
  args: UseOrganizationsListArgs,
): ResourceListResult<Organization> {
  return useSearchListQuery(organizationsSearch, args);
}
