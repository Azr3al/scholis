"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Job } from "../_types/jobs";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { jobsSearch } from "../resources/jobs";

export type UseJobsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useJobsList(
  args: UseJobsListArgs,
): ResourceListResult<Job> {
  return useSearchListQuery(jobsSearch, args);
}
