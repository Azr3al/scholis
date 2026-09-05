import { format } from "date-fns";

import type { CourseDataSheetRow } from "@/types/data-sheets";

export type CourseBlockHighlight = "start" | "end" | "both";

export const COURSE_BLOCK_HIGHLIGHT_BG = {
  start: "#dcfce7",
  end: "#dbeafe",
  both: "#fef3c7",
} as const;

export function isCourseDateInMonth(
  ymd: string | null | undefined,
  monthAnchor: Date,
): boolean {
  if (!ymd) return false;
  const monthKey = format(monthAnchor, "yyyy-MM");
  return ymd.slice(0, 7) === monthKey;
}

export function getCourseBlockHighlight(
  course: CourseDataSheetRow | undefined,
  monthAnchor: Date,
): CourseBlockHighlight | null {
  if (!course) return null;

  const startsInMonth = isCourseDateInMonth(course.start_date, monthAnchor);
  const endsInMonth = isCourseDateInMonth(course.end_date, monthAnchor);

  if (startsInMonth && endsInMonth) return "both";
  if (startsInMonth) return "start";
  if (endsInMonth) return "end";
  return null;
}

export function blockHighlightTheme(
  highlight: CourseBlockHighlight,
): { bgCell: string } {
  return { bgCell: COURSE_BLOCK_HIGHLIGHT_BG[highlight] };
}

export type CourseDataCategoryStats = {
  totalClasses: number;
  totalStudents: number;
  starting: number;
  ending: number;
  startingAndEnding: number;
};

export function computeCourseDataCategoryStats(
  courses: CourseDataSheetRow[],
  monthAnchor: Date,
): CourseDataCategoryStats {
  let starting = 0;
  let ending = 0;
  let startingAndEnding = 0;
  let totalStudents = 0;

  for (const course of courses) {
    totalStudents += course.student_count ?? 0;
    const highlight = getCourseBlockHighlight(course, monthAnchor);
    if (highlight === "both") {
      startingAndEnding += 1;
      starting += 1;
      ending += 1;
    } else if (highlight === "start") {
      starting += 1;
    } else if (highlight === "end") {
      ending += 1;
    }
  }

  return {
    totalClasses: courses.length,
    totalStudents,
    starting,
    ending,
    startingAndEnding,
  };
}
