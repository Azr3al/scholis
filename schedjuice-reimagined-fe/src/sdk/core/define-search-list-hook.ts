/**
 * Client-side search-list factory: list + useList + keys for T1 entity cutovers.
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type { ResourceListResult } from "@/components/data-table/types";

import {
  defineSearchListResource,
  type DefineSearchListOptions,
  type DefinedSearchListResource,
  type SearchListArgs,
  type SearchListKeys,
} from "./define-search-list";

export type DefinedSearchList<T> = DefinedSearchListResource<T> & {
  useList: (args: SearchListArgs & { enabled?: boolean }) => ResourceListResult<T>;
};

export type {
  DefineSearchListOptions,
  SearchListArgs,
  SearchListKeys,
} from "./define-search-list";

export function useSearchListQuery<T>(
  resource: DefinedSearchListResource<T>,
  args: SearchListArgs & { enabled?: boolean },
): ResourceListResult<T> {
  const { enabled = true, ...listArgs } = args;
  const query = useQuery({
    queryKey: resource.keys.list(listArgs),
    queryFn: () => resource.list(listArgs),
    enabled,
  });

  return {
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}

/**
 * Creates imperative `list`, `useList` hook, and query-key helpers for an entity search endpoint.
 *
 * @example
 * ```ts
 * const categories = defineSearchList<Category>({
 *   path: "categories",
 *   keyNamespace: "categories",
 * });
 * export const listCategories = categories.list;
 * export const useCategoriesList = categories.useList;
 * export const categoriesKeys = categories.keys;
 * ```
 */
export function defineSearchList<T>(
  options: DefineSearchListOptions,
): DefinedSearchList<T> {
  const resource = defineSearchListResource<T>(options);

  function useList(
    args: SearchListArgs & { enabled?: boolean },
  ): ResourceListResult<T> {
    return useSearchListQuery(resource, args);
  }

  return { ...resource, useList };
}
