import type { DataVerificationRequest } from "../_types/data-verification-requests";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListDataVerificationRequestsArgs = SearchListArgs;

export const dataVerificationRequestsSearch = defineSearchListResource<DataVerificationRequest>({
  path: "data-verification-requests",
  keyNamespace: "data-verification-requests",
});

export const listDataVerificationRequests = dataVerificationRequestsSearch.list;
