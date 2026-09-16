/**
 * Shared list-hook / resource args for ResourceTable-backed entity lists.
 *
 * `filterParams` accepts either:
 * - a `filter_params` array (legacy / SdkListArgs default), or
 * - a full search body (`filterParamsBody` / getDataFilterParams object).
 */

import type { SdkFilterBody } from "./http";
import type { SdkSearchQueryParams } from "./search-params";

export type SdkListArgs = {
  page: number;
  pageSize: number;
  sorts: string[];
  q: string;
  /** Opaque UI filters (query-key only; not sent unless mapped). */
  filters?: Record<string, unknown>;
  /**
   * Search filter body: either `filter_params` array entries, or a full
   * `{ filter_params, exclude_params, facets? }` object (getDataFilterParams).
   */
  filterParams?: unknown[] | SdkFilterBody | Record<string, unknown> | unknown;
  excludeParams?: unknown[];
  expand?: string[];
  fields?: string[];
  teacher_roster_order?: boolean;
  student_roster_order?: boolean;
};

export function toSearchQueryParams(args: SdkListArgs): SdkSearchQueryParams {
  return {
    page: args.page,
    size: args.pageSize,
    sorts: args.sorts,
    q: args.q || undefined,
    expand: args.expand,
    fields: args.fields,
    teacher_roster_order: args.teacher_roster_order,
    student_roster_order: args.student_roster_order,
  };
}

function isFilterBodyObject(
  value: unknown,
): value is SdkFilterBody & Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function toFilterBody(args: SdkListArgs): SdkFilterBody {
  const fp = args.filterParams;
  if (isFilterBodyObject(fp)) {
    return {
      ...fp,
      filter_params: fp.filter_params ?? [],
      exclude_params: fp.exclude_params ?? args.excludeParams ?? [],
    };
  }
  return {
    filter_params: (fp as unknown[] | undefined) ?? [],
    exclude_params: args.excludeParams ?? [],
  };
}

export function listKeyPayload(args: SdkListArgs) {
  return {
    page: args.page,
    pageSize: args.pageSize,
    sorts: args.sorts,
    q: args.q,
    filters: args.filters ?? {},
    filterParams: args.filterParams ?? [],
    excludeParams: args.excludeParams ?? [],
    expand: args.expand ?? [],
    fields: args.fields ?? [],
    teacher_roster_order: args.teacher_roster_order ?? false,
    student_roster_order: args.student_roster_order ?? false,
  };
}
