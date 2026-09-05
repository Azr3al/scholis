import type { SearchListArgs } from "../core/define-search-list";
import { categoriesSearch } from "../resources/categories";

export type CategoriesListKeyArgs = SearchListArgs;

export const categoriesKeys = categoriesSearch.keys;
