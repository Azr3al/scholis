/** Split backend STRING_AGG teacher columns (comma-separated). */
export function parseTeacherNames(value: string | null | undefined): string[] {
  if (value == null || value.trim() === "") return [];
  return value.split(/,\s*/).filter(Boolean);
}
