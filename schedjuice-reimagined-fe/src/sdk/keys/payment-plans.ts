import type { SearchListArgs } from "../core/define-search-list";
import { paymentPlansSearch } from "../resources/payment-plans";

export type PaymentPlansListKeyArgs = SearchListArgs;

export const paymentPlansKeys = paymentPlansSearch.keys;
