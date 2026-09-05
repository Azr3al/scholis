import type { Category } from "../_types/categories";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListCategoriesArgs = SearchListArgs;

export const categoriesSearch = defineSearchListResource<Category>({
  path: "categories",
  keyNamespace: "categories",
});

export const listCategories = categoriesSearch.list;
