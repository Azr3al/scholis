import { format, isValid, parse } from "date-fns";

/** Course data sheet display: e.g. 27/8/2026 */
export function formatCourseSheetDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  try {
    const parsed = parse(ymd, "yyyy-MM-dd", new Date());
    if (!isValid(parsed)) return "";
    return format(parsed, "d/M/yyyy");
  } catch {
    return "";
  }
}
