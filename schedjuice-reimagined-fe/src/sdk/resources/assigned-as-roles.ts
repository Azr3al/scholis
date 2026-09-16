import type { AssignedAsRole } from "../_types/assigned-as-roles";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListAssignedAsRolesArgs = SearchListArgs;

export const assignedAsRolesSearch = defineSearchListResource<AssignedAsRole>({
  path: "assigned-as-roles",
  keyNamespace: "assigned-as-roles",
});

export const listAssignedAsRoles = assignedAsRolesSearch.list;
