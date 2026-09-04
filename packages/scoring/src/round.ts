/**
 * Round to four decimal places.
 *
 * Partial credit divides points by the number of correct options, so binary
 * floating point routinely produces 0.30000000000000004. Four places matches
 * the `numeric(12,4)` column the score lands in, so what the scorer computes
 * and what the database stores are the same number — otherwise totals
 * recomputed from stored per-question scores drift from the original.
 */
export const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/** Clamp into `[0, max]`. Partial credit and manual marks can both stray outside. */
export const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);
