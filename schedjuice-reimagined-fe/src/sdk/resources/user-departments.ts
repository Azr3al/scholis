import type { UserDepartment } from "../_types/user-departments";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListUserDepartmentsArgs = SearchListArgs;

export const userDepartmentsSearch = defineSearchListResource<UserDepartment>({
  path: "user-departments",
  keyNamespace: "user-departments",
});

export const listUserDepartments = userDepartmentsSearch.list;
