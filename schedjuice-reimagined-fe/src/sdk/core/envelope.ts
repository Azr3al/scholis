/**
 * Schedjuice list/search envelope helpers.
 *
 * Production truth (axios response):
 * - Rows: `res.data?.data` (array) — consumed by ResourceTable / unwrapList
 * - Page count: `res.data?.total_pages`
 * - Total row count: `res.data?.count` — see `utilitas/pagination.py` + academic-hub hooks
 *   (`payload.count`). Some older sketches used `total`; we accept that as a secondary alias.
 *
 * ResourceTable pagination needs **total row count** (`total`), not page count.
 */

export type SchedjuiceListEnvelope<T> = {
  data?: T[];
  count?: number;
  total?: number;
  total_pages?: number;
};

export type UnwrapListOptions = {
  /** Used only when neither `count` nor `total` is present — last-resort estimate. */
  pageSize?: number;
};

export type UnwrappedList<T> = {
  rows: T[];
  total: number;
};

function asEnvelope<T>(
  input: { data?: SchedjuiceListEnvelope<T> } | SchedjuiceListEnvelope<T> | null | undefined,
): SchedjuiceListEnvelope<T> {
  if (input == null) return {};
  // Axios-like: { data: { data, count, total_pages } }
  if (
    typeof input === "object" &&
    "data" in input &&
    input.data != null &&
    typeof input.data === "object" &&
    !Array.isArray(input.data)
  ) {
    return input.data as SchedjuiceListEnvelope<T>;
  }
  // Already unwrapped payload
  return input as SchedjuiceListEnvelope<T>;
}

export function unwrapList<T>(
  input: { data?: SchedjuiceListEnvelope<T> } | SchedjuiceListEnvelope<T> | null | undefined,
  options: UnwrapListOptions = {},
): UnwrappedList<T> {
  const envelope = asEnvelope<T>(input);
  const rows = Array.isArray(envelope.data) ? envelope.data : [];

  if (typeof envelope.count === "number") {
    return { rows, total: envelope.count };
  }
  if (typeof envelope.total === "number") {
    return { rows, total: envelope.total };
  }

  // Last resort: estimate from total_pages * pageSize so ResourceTable can still paginate.
  // Prefer real `count` from the API whenever available.
  if (
    typeof envelope.total_pages === "number" &&
    typeof options.pageSize === "number" &&
    options.pageSize > 0
  ) {
    return { rows, total: envelope.total_pages * options.pageSize };
  }

  return { rows, total: rows.length };
}
