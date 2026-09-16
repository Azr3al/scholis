import type { News } from "../_types/news";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListNewsArgs = SearchListArgs;

export const newsSearch = defineSearchListResource<News>({
  path: "news",
  keyNamespace: "news",
});

export const listNews = newsSearch.list;
