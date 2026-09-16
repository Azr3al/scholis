import type { PaymentInfo } from "../_types/payment-infos";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListPaymentInfosArgs = SearchListArgs;

export const paymentInfosSearch = defineSearchListResource<PaymentInfo>({
  path: "payment-infos",
  keyNamespace: "payment-infos",
});

export const listPaymentInfos = paymentInfosSearch.list;
