import type { SearchListArgs } from "../core/define-search-list";
import { userEmailsSearch } from "../resources/user-emails";

export type UserEmailsListKeyArgs = SearchListArgs;

export const userEmailsKeys = userEmailsSearch.keys;
