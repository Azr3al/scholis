"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { searchEntities } from "@/app/client-api/utils";
import { queryParamDefault } from "@/config/defaults";
import {
  RECENT_TRANSACTIONS_LIST_EXPAND,
  RECENT_TRANSACTIONS_LIST_FIELDS,
  RECENT_TRANSACTIONS_PAGE_SIZE,
} from "@/lib/finances/recent-transactions-list-fields";
import type { UserPayment } from "@/sdk";
import type { filterParam } from "@/types/api";

export function useRecentTransactionsInfinite(args: {
  filterParams: filterParam[];
  sorts: string[];
  enabled: boolean;
}) {
  const query = useInfiniteQuery({
    queryKey: ["recent-transactions-infinite", args.filterParams, args.sorts],
    enabled: args.enabled,
    queryFn: ({ pageParam = 1 }) =>
      searchEntities(
        "user-payments",
        {
          ...queryParamDefault,
          page: pageParam,
          size: RECENT_TRANSACTIONS_PAGE_SIZE,
          sorts: args.sorts,
          fields: [...RECENT_TRANSACTIONS_LIST_FIELDS],
          expand: [...RECENT_TRANSACTIONS_LIST_EXPAND],
        },
        { filter_params: args.filterParams },
      ),
    getNextPageParam: (lastPage, pages) =>
      lastPage.data?.links?.next ? pages.length + 1 : undefined,
  });

  const rows: UserPayment[] =
    query.data?.pages.flatMap(
      (page) => (page?.data?.data ?? []) as UserPayment[],
    ) ?? [];

  return {
    rows,
    fetchNextPage: () => void query.fetchNextPage(),
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
