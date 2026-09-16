import type { UserPayment } from "../_types/user-payments";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListUserPaymentsArgs = SearchListArgs;

export const userPaymentsSearch = defineSearchListResource<UserPayment>({
  path: "user-payments",
  keyNamespace: "user-payments",
});

export const listUserPayments = userPaymentsSearch.list;
