/**
 * True when `raw` is safe to use as a numeric primary key in API paths and `__exact` filters.
 * Rejects empty strings and JS-serialization garbage (`"undefined"`, `"NaN"`, `"null"`).
 */
export function isValidApiEntityIdParam(
  raw: string | undefined | null,
): boolean {
  if (raw == null) return false;
  const t = String(raw).trim();
  if (!t) return false;
  if (t === "undefined" || t === "NaN" || t === "null") return false;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && Number.isInteger(n);
}

/**
 * Coerce a DRF relation field for PATCH/POST: raw pk, expanded `{ id, ... }`, or null.
 * Sending nested objects causes "Expected pk value, received dict."
 */
export function relationFkToPkNullable(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return null;
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === "number" && Number.isFinite(id)) return id;
    if (typeof id === "string") {
      const n = Number(id);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}
