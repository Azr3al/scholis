import type { SearchListArgs } from "../core/define-search-list";
import { dataVerificationRequestsSearch } from "../resources/data-verification-requests";

export type DataVerificationRequestsListKeyArgs = SearchListArgs;

export const dataVerificationRequestsKeys = dataVerificationRequestsSearch.keys;
