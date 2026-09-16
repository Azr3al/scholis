import type { SearchListArgs } from "../core/define-search-list";
import { assignedAsRolesSearch } from "../resources/assigned-as-roles";

export type AssignedAsRolesListKeyArgs = SearchListArgs;

export const assignedAsRolesKeys = assignedAsRolesSearch.keys;
