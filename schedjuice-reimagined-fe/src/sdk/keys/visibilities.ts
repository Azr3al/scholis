import type { SearchListArgs } from "../core/define-search-list";
import { visibilitiesSearch } from "../resources/visibilities";

export type VisibilitiesListKeyArgs = SearchListArgs;

export const visibilitiesKeys = visibilitiesSearch.keys;
