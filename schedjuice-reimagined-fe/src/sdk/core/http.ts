/**
 * Thin axios bootstrap for SDK resources only.
 * Allowed T0 dependency: `axiosClient` from `@/lib/api`.
 */

import { axiosClient } from "@/lib/api";

import { makeSearchParams, type SdkSearchQueryParams } from "./search-params";

export type SdkFilterBody = {
  filter_params?: unknown[];
  exclude_params?: unknown[];
  facets?: unknown[];
  [key: string]: unknown;
};

export async function search<T = unknown>(
  entity: string,
  queryParams: SdkSearchQueryParams = {},
  filterBody: SdkFilterBody = {},
): Promise<{ data: T }> {
  const res = await axiosClient.post(
    `${entity}/search${makeSearchParams(queryParams)}`,
    filterBody,
  );
  return res as { data: T };
}

/** POST to an arbitrary path (e.g. `user-payments/unpaid`) with search query params. */
export async function searchPath<T = unknown>(
  path: string,
  queryParams: SdkSearchQueryParams = {},
  filterBody: SdkFilterBody = {},
): Promise<{ data: T }> {
  const res = await axiosClient.post(
    `${path}${makeSearchParams(queryParams)}`,
    filterBody,
  );
  return res as { data: T };
}
