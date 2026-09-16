"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Department } from "../_types/departments";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { departmentsSearch } from "../resources/departments";

export type UseDepartmentsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useDepartmentsList(
  args: UseDepartmentsListArgs,
): ResourceListResult<Department> {
  return useSearchListQuery(departmentsSearch, args);
}
