import type { SearchListArgs } from "../core/define-search-list";
import { newsSearch } from "../resources/news";

export type NewsListKeyArgs = SearchListArgs;

export const newsKeys = newsSearch.keys;
