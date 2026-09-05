"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { PaymentPlan } from "../_types/payment-plans";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { paymentPlansSearch } from "../resources/payment-plans";

export type UsePaymentPlansListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function usePaymentPlansList(
  args: UsePaymentPlansListArgs,
): ResourceListResult<PaymentPlan> {
  return useSearchListQuery(paymentPlansSearch, args);
}
