import type { Campus } from "../_types/campuses";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListCampusesArgs = SearchListArgs;

/**
 * Shared campuses search-list resource (list + keys).
 * Public wrappers keep `listCampuses` / `useCampusesList` / `queryKeys.campuses` stable.
 */
export const campusesSearch = defineSearchListResource<Campus>({
  path: "campuses",
  keyNamespace: "campuses",
});

export const listCampuses = campusesSearch.list;
