import type { SearchListArgs } from "../core/define-search-list";
import { userPaymentsSearch } from "../resources/user-payments";

export type UserPaymentsListKeyArgs = SearchListArgs;

export const userPaymentsKeys = userPaymentsSearch.keys;
