"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Category } from "../_types/categories";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { categoriesSearch } from "../resources/categories";

export type UseCategoriesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useCategoriesList(
  args: UseCategoriesListArgs,
): ResourceListResult<Category> {
  return useSearchListQuery(categoriesSearch, args);
}
