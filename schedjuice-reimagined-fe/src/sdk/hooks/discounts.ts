"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Discount } from "../_types/discounts";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { discountsSearch } from "../resources/discounts";

export type UseDiscountsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useDiscountsList(
  args: UseDiscountsListArgs,
): ResourceListResult<Discount> {
  return useSearchListQuery(discountsSearch, args);
}
