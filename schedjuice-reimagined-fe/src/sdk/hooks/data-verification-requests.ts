"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { DataVerificationRequest } from "../_types/data-verification-requests";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { dataVerificationRequestsSearch } from "../resources/data-verification-requests";

export type UseDataVerificationRequestsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useDataVerificationRequestsList(
  args: UseDataVerificationRequestsListArgs,
): ResourceListResult<DataVerificationRequest> {
  return useSearchListQuery(dataVerificationRequestsSearch, args);
}
