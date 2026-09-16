import type { SearchListArgs } from "../core/define-search-list";
import { departmentsSearch } from "../resources/departments";

export type DepartmentsListKeyArgs = SearchListArgs;

export const departmentsKeys = departmentsSearch.keys;
