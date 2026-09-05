/**
 * Shared factory for T1 entity list cutovers: POST `${path}/search` + query keys.
 * For the React Query hook, use `defineSearchList` from `./define-search-list-hook`.
 */

import { unwrapList, type SchedjuiceListEnvelope } from "./envelope";
import { search, type SdkFilterBody } from "./http";
import {
  listKeyPayload,
  toFilterBody,
  toSearchQueryParams,
  type SdkListArgs,
} from "./list-args";

/** List args for ResourceTable-backed search endpoints (alias of SdkListArgs). */
export type SearchListArgs = SdkListArgs;

export type SearchListKeys = {
  all: readonly [string];
  lists: () => readonly [string, "list"];
  list: (
    args: SearchListArgs,
  ) => readonly [string, "list", ReturnType<typeof listKeyPayload>];
};

export type DefineSearchListOptions = {
  /** API resource path segment, e.g. `"categories"`. */
  path: string;
  /** Query-key root segment, e.g. `"categories"`. */
  keyNamespace: string;
  /**
   * Optional override for the POST body builder.
   * Default uses `toFilterBody` (supports filter_params arrays or full filterParamsBody).
   */
  filterBody?: (args: SearchListArgs) => SdkFilterBody;
};

export type DefinedSearchListResource<T> = {
  list: (args: SearchListArgs) => Promise<{ rows: T[]; total: number }>;
  keys: SearchListKeys;
};

export function defineSearchListKeys(keyNamespace: string): SearchListKeys {
  const keys: SearchListKeys = {
    all: [keyNamespace] as const,
    lists: () => [...keys.all, "list"] as const,
    list: (args: SearchListArgs) =>
      [...keys.lists(), listKeyPayload(args)] as const,
  };
  return keys;
}

export function defineSearchListFn<T>(
  path: string,
  options: Pick<DefineSearchListOptions, "filterBody"> = {},
) {
  const buildFilterBody = options.filterBody ?? toFilterBody;
  return async function list(
    args: SearchListArgs,
  ): Promise<{ rows: T[]; total: number }> {
    const res = await search<SchedjuiceListEnvelope<T>>(
      path,
      toSearchQueryParams(args),
      buildFilterBody(args),
    );
    return unwrapList<T>(res, { pageSize: args.pageSize });
  };
}

/**
 * Creates imperative `list` + query-key helpers for an entity search endpoint.
 * Prefer `defineSearchList` from `define-search-list-hook` when you also need `useList`.
 */
export function defineSearchListResource<T>(
  options: DefineSearchListOptions,
): DefinedSearchListResource<T> {
  const keys = defineSearchListKeys(options.keyNamespace);
  const list = defineSearchListFn<T>(options.path, {
    filterBody: options.filterBody,
  });
  return { list, keys };
}
