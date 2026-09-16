"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { PaymentMethod } from "../_types/payment-methods";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { paymentMethodsSearch } from "../resources/payment-methods";

export type UsePaymentMethodsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function usePaymentMethodsList(
  args: UsePaymentMethodsListArgs,
): ResourceListResult<PaymentMethod> {
  return useSearchListQuery(paymentMethodsSearch, args);
}
