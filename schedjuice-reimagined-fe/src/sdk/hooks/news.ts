"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { News } from "../_types/news";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { newsSearch } from "../resources/news";

export type UseNewsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useNewsList(
  args: UseNewsListArgs,
): ResourceListResult<News> {
  return useSearchListQuery(newsSearch, args);
}
