import type { PaymentPlan } from "../_types/payment-plans";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListPaymentPlansArgs = SearchListArgs;

export const paymentPlansSearch = defineSearchListResource<PaymentPlan>({
  path: "payment-plans",
  keyNamespace: "payment-plans",
});

export const listPaymentPlans = paymentPlansSearch.list;
