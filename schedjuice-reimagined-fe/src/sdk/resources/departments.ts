import type { Department } from "../_types/departments";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListDepartmentsArgs = SearchListArgs;

export const departmentsSearch = defineSearchListResource<Department>({
  path: "departments",
  keyNamespace: "departments",
});

export const listDepartments = departmentsSearch.list;
