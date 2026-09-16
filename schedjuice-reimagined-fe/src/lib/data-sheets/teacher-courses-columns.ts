import type { GridColumn } from "@glideapps/glide-data-grid";

import type { CourseChip } from "@/components/data-sheet/cells/course-chips-cell";

export const TEACHER_COURSES_FIELDS = [
  "name",
  "email",
  "assigned_classes",
  "course_type",
  "duration",
] as const;

export type TeacherCoursesField = (typeof TEACHER_COURSES_FIELDS)[number];

export type TeacherCoursesReportRow = {
  name: string;
  email: string;
  assigned_classes: string;
  course_type: string;
  duration: string;
  user_id: number;
  course_id?: number;
  courses?: CourseChip[];
};

export type TeacherCoursesColumnMeta = {
  key: TeacherCoursesField;
  title: string;
  width: number;
};

export type TeacherCoursesColumnDef = {
  id: TeacherCoursesField;
  title: string;
  width: number;
};

const DEFAULT_TITLES: Record<TeacherCoursesField, string> = {
  name: "Name",
  email: "Email",
  assigned_classes: "Assigned Classes",
  course_type: "Type",
  duration: "Duration",
};

const DEFAULT_WIDTHS: Record<TeacherCoursesField, number> = {
  name: 180,
  email: 240,
  assigned_classes: 360,
  course_type: 80,
  duration: 100,
};

const DEFAULT_COLUMNS: TeacherCoursesColumnDef[] = TEACHER_COURSES_FIELDS.map(
  (id) => ({
    id,
    title: DEFAULT_TITLES[id],
    width: DEFAULT_WIDTHS[id],
  }),
);

export function splitAssignedClasses(
  value: string | null | undefined,
): string[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function teacherCoursesFromRow(
  row: TeacherCoursesReportRow | undefined,
): CourseChip[] {
  if (!row) return [];
  if (row.courses?.length) {
    return row.courses;
  }
  return splitAssignedClasses(row.assigned_classes).map((title, index) => ({
    id: index,
    title,
  }));
}

export function teacherCoursesRowHeight(
  courseCount: number,
  baseRowHeight = 36,
): number {
  if (courseCount <= 1) return baseRowHeight;
  return baseRowHeight + (courseCount - 1) * 28;
}

export function buildTeacherCoursesColumns(
  meta?: TeacherCoursesColumnMeta[],
): TeacherCoursesColumnDef[] {
  const allowed = new Set<string>(TEACHER_COURSES_FIELDS);
  if (!meta?.length) {
    return DEFAULT_COLUMNS;
  }
  const mapped = meta
    .filter((column) => allowed.has(column.key))
    .map((column) => ({
      id: column.key,
      title: column.title,
      width: DEFAULT_WIDTHS[column.key] ?? column.width ?? 160,
    }));
  return mapped.length ? mapped : DEFAULT_COLUMNS;
}

export function toTeacherCoursesGridColumns(
  columns: TeacherCoursesColumnDef[],
): GridColumn[] {
  return columns.map((column) => ({
    id: column.id,
    title: column.title,
    width: column.width,
  }));
}

export function toTeacherCoursesFieldByColumn(
  columns: TeacherCoursesColumnDef[],
): string[] {
  return columns.map((column) => column.id);
}
