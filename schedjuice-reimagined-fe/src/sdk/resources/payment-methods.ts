import type { PaymentMethod } from "../_types/payment-methods";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListPaymentMethodsArgs = SearchListArgs;

export const paymentMethodsSearch = defineSearchListResource<PaymentMethod>({
  path: "payment-methods",
  keyNamespace: "payment-methods",
});

export const listPaymentMethods = paymentMethodsSearch.list;
