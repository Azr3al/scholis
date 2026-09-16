"use client";

import { useQuery } from "@tanstack/react-query";

import type { ResourceListResult } from "@/components/data-table/types";

import type { User } from "../_types/users";
import type { SdkListArgs } from "../core/list-args";
import {
  listUnpaidUsers,
  unpaidUsersKeys,
} from "../resources/unpaid-users";

export type UseUnpaidUsersListArgs = SdkListArgs & {
  enabled?: boolean;
};

export function useUnpaidUsersList(
  args: UseUnpaidUsersListArgs,
): ResourceListResult<User> {
  const { enabled = true, ...listArgs } = args;
  const query = useQuery({
    queryKey: unpaidUsersKeys.list(listArgs),
    queryFn: () => listUnpaidUsers(listArgs),
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
