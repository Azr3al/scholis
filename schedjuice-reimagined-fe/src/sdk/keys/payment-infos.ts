import type { SearchListArgs } from "../core/define-search-list";
import { paymentInfosSearch } from "../resources/payment-infos";

export type PaymentInfosListKeyArgs = SearchListArgs;

export const paymentInfosKeys = paymentInfosSearch.keys;
