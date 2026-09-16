import type { CourseDataSheetRow } from "@/types/data-sheets";

export type CourseGroupKey = "FM_WD" | "FM_WE" | "HM_WD" | "HM_WE" | "OTHER";

/** HM if start_date day-of-month > 13, else FM. Null/invalid => FM. */
export function isHalfMonth(startDate: string | null): boolean {
  if (!startDate) return false;
  const day = Number(startDate.slice(8, 10));
  return Number.isFinite(day) && day > 13;
}

export function groupKeyFor(r: CourseDataSheetRow): CourseGroupKey {
  if (r.course_type !== "WD" && r.course_type !== "WE") return "OTHER";
  const half = isHalfMonth(r.start_date);
  if (r.course_type === "WD") return half ? "HM_WD" : "FM_WD";
  return half ? "HM_WE" : "FM_WE";
}
