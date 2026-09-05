import type { SearchListArgs } from "../core/define-search-list";
import { paymentMethodsSearch } from "../resources/payment-methods";

export type PaymentMethodsListKeyArgs = SearchListArgs;

export const paymentMethodsKeys = paymentMethodsSearch.keys;
