import type { CoursePairedDisplayRow } from "@/lib/data-sheets/course-data-paired-layout";
import type { CourseDataSheetRow } from "@/types/data-sheets";

import { parseTeacherNames } from "./parse-teacher-names";

export function rowHeightForLineCount(
  lineCount: number,
  baseRowHeight: number,
): number {
  const lines = Math.max(1, lineCount);
  return Math.max(baseRowHeight, baseRowHeight + (lines - 1) * 22);
}

function teacherLineCount(value: string | null | undefined): number {
  const names = parseTeacherNames(value);
  return names.length === 0 ? 1 : names.length;
}

function maxTeacherLinesForCourse(course: CourseDataSheetRow | undefined): number {
  if (!course) return 1;
  return Math.max(
    teacherLineCount(course.main_teachers),
    teacherLineCount(course.assistant_teachers),
  );
}

export function courseDataRowLineCount(
  row: CoursePairedDisplayRow,
  blockCount: number,
): number {
  if (row.kind === "summary") return 1;

  if (row.kind === "other") {
    return maxTeacherLinesForCourse(row.row);
  }

  let maxLines = 1;
  for (let i = 0; i < blockCount; i++) {
    maxLines = Math.max(maxLines, maxTeacherLinesForCourse(row.cells[i]));
  }
  return maxLines;
}

export function precomputeCourseDataRowHeights(
  rows: CoursePairedDisplayRow[],
  blockCount: number,
  baseRowHeight: number,
): number[] {
  return rows.map((row) =>
    rowHeightForLineCount(courseDataRowLineCount(row, blockCount), baseRowHeight),
  );
}
