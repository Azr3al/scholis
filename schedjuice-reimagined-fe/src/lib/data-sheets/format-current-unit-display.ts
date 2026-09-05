import { formatCourseSheetDate } from "@/lib/data-sheets/format-course-sheet-date";

export function formatCurrentUnitDisplay(
  unit: number | null | undefined,
  updatedAt: string | null | undefined,
): string {
  if (unit == null) return "";
  const date = formatCourseSheetDate(updatedAt);
  return date ? `${unit} (${date})` : String(unit);
}
