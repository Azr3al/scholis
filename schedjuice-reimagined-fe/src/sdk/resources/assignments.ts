import type { Assignment } from "../_types/assignments";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListAssignmentsArgs = SearchListArgs;

export const assignmentsSearch = defineSearchListResource<Assignment>({
  path: "assignments",
  keyNamespace: "assignments",
});

export const listAssignments = assignmentsSearch.list;
