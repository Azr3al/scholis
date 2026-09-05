"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { PaymentInfo } from "../_types/payment-infos";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { paymentInfosSearch } from "../resources/payment-infos";

export type UsePaymentInfosListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function usePaymentInfosList(
  args: UsePaymentInfosListArgs,
): ResourceListResult<PaymentInfo> {
  return useSearchListQuery(paymentInfosSearch, args);
}
