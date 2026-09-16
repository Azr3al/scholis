/**
 * Resolves a foreign key from API data to a positive integer id for Selects, etc.
 * Handles: number, numeric string, and expanded `{ id: number }` objects.
 */
export function coerceEntityId(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "object" && value !== null && "id" in value) {
    return coerceEntityId((value as { id: unknown }).id);
  }
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}
