import type { SearchListArgs } from "../core/define-search-list";
import { usersSearch } from "../resources/users";

export type UsersListKeyArgs = SearchListArgs;

export const usersKeys = usersSearch.keys;
