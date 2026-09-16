import type { SearchListArgs } from "../core/define-search-list";
import { campusesSearch } from "../resources/campuses";

export type CampusesListKeyArgs = SearchListArgs;

export const campusesKeys = campusesSearch.keys;
