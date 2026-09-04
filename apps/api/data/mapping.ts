// Drizzle hands back `numeric` as a string. Converting here keeps that
// assumption in one layer.
//
// Representation only — deciding what a missing score *means* is a service's
// job, not this file's.
export const toNumber = (value: string | null): number | null =>
  value === null ? null : Number(value);

// Caller passes the default explicitly. A missing score and a zero are
// different facts (see pending_manual) and collapsing them here would lose it.
export const toNumberOr = (value: string | null, fallback: number): number =>
  value === null ? fallback : Number(value);

/** The inverse, for writes. Postgres accepts a string for `numeric`. */
export const fromNumber = (value: number | null): string | null =>
  value === null ? null : value.toString();
