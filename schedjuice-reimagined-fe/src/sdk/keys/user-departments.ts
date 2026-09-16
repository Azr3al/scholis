import type { SearchListArgs } from "../core/define-search-list";
import { userDepartmentsSearch } from "../resources/user-departments";

export type UserDepartmentsListKeyArgs = SearchListArgs;

export const userDepartmentsKeys = userDepartmentsSearch.keys;
