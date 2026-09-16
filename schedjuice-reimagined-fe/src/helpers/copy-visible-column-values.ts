export function copyVisibleColumnValues(
  values: string[],
  options?: { dedupeKeys?: Array<string | number | null | undefined> },
): string {
  const keys = options?.dedupeKeys;
  if (!keys) {
    return values.join("\n");
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const raw = keys[i];
    const key =
      raw === null || raw === undefined || raw === ""
        ? `__idx:${i}`
        : String(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(values[i] ?? "");
  }
  return out.join("\n");
}
