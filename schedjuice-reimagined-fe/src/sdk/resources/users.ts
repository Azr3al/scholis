import type { User } from "../_types/users";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListUsersArgs = SearchListArgs;

export const usersSearch = defineSearchListResource<User>({
  path: "users",
  keyNamespace: "users",
});

export const listUsers = usersSearch.list;
