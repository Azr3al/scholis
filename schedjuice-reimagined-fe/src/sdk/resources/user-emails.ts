import type { UserEmail } from "../_types/user-emails";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListUserEmailsArgs = SearchListArgs;

export const userEmailsSearch = defineSearchListResource<UserEmail>({
  path: "user-emails",
  keyNamespace: "user-emails",
});

export const listUserEmails = userEmailsSearch.list;
