import type { CoursePairedDisplayRow } from "@/lib/data-sheets/course-data-paired-layout";
import { isCourseDataDividerField } from "@/lib/data-sheets/course-data-sheet-columns";
import type { CourseDataSheetRow } from "@/types/data-sheets";

type FieldRole =
  | "title"
  | "start"
  | "end"
  | "mt"
  | "at"
  | "students"
  | "ratio"
  | "total"
  | "unit";

function parseBlockField(
  field: string | null,
): { index: number; role: FieldRole } | null {
  if (!field || isCourseDataDividerField(field)) return null;
  const match = /^b(\d+)_(title|start|end|mt|at|students|ratio|total|unit)$/.exec(
    field,
  );
  if (!match) return null;
  return {
    index: Number(match[1]),
    role: match[2] as FieldRole,
  };
}

function getCourseForBlock(
  row: CoursePairedDisplayRow,
  blockIndex: number,
): CourseDataSheetRow | undefined {
  if (row.kind === "paired") return row.cells[blockIndex];
  if (row.kind === "other" && blockIndex === 0) return row.row;
  return undefined;
}

/** Resolve a course id when the user clicks a title chip cell on the course data sheet. */
export function resolveCourseChipClick(
  row: CoursePairedDisplayRow | undefined,
  field: string | null,
): number | null {
  if (!row || row.kind === "summary") return null;

  const parsed = parseBlockField(field);
  if (!parsed || parsed.role !== "title") return null;

  const course = getCourseForBlock(row, parsed.index);
  return course?.course_id ?? null;
}
