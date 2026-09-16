"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { UserPayment } from "../_types/user-payments";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { userPaymentsSearch } from "../resources/user-payments";

export type UseUserPaymentsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useUserPaymentsList(
  args: UseUserPaymentsListArgs,
): ResourceListResult<UserPayment> {
  return useSearchListQuery(userPaymentsSearch, args);
}
