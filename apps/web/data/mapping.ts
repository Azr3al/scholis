/**
 * Row-to-domain translation helpers.
 *
 * `data/` owns representation, not decisions (IMPLEMENTATION.md §3.1, rule 3).
 * Turning a `numeric` column into a `number` is representation. Deciding what a
 * missing score *means* is not, and belongs in a service or the domain core.
 *
 * Drizzle returns `numeric` as a string rather than a number, because a JS
 * number cannot hold arbitrary precision. Our scale is 4 decimal places and our
 * magnitudes are exam marks, so `Number()` is lossless here — but the
 * conversion happens in exactly one layer so that assumption lives in one place.
 */
export const toNumber = (value: string | null): number | null =>
  value === null ? null : Number(value);

/**
 * Map a nullable column with an explicit default.
 *
 * Callers must pass the default rather than getting an implicit `0`: a missing
 * score and a score of zero are different facts (see `pending_manual` in the
 * scorer), and silently collapsing them here would erase the distinction before
 * a service could act on it.
 */
export const toNumberOr = (value: string | null, fallback: number): number =>
  value === null ? fallback : Number(value);

/** The inverse, for writes. Postgres accepts a string for `numeric`. */
export const fromNumber = (value: number | null): string | null =>
  value === null ? null : value.toString();
