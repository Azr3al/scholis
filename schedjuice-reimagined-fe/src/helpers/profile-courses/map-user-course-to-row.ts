import type { RecordCourseRowData } from "@/components/record/academic/record-course-row";

type UserCourseApiRow = {
  id: number;
  course?: {
    id?: number;
    title?: string;
    code?: string | null;
    status?: string;
    program?: RecordCourseRowData["program"];
    level?: RecordCourseRowData["level"];
    section?: RecordCourseRowData["section"];
    subject?: RecordCourseRowData["subject"];
    course_subjects?: RecordCourseRowData["course_subjects"];
    weekday_pattern?: string | null;
    time_pattern?: string | null;
    first_event_time_from?: string | null;
    first_event_time_to?: string | null;
  } | number | null;
  assigned_as_role?: { name?: string; seniority?: string | null } | null;
};

export function mapUserCourseToRow(
  row: UserCourseApiRow,
  opts: {
    nextSessionLabel?: string | null;
    isShared: boolean;
  },
): (RecordCourseRowData & { roleSeniority?: string | null }) | null {
  const course = row.course;
  if (course == null || typeof course !== "object") return null;
  const courseId = course.id;
  if (courseId == null) return null;

  return {
    userCourseId: row.id,
    courseId,
    title: course.title ?? "Untitled course",
    code: course.code ?? null,
    status: course.status,
    assignedRoleName: row.assigned_as_role?.name,
    roleSeniority: row.assigned_as_role?.seniority,
    program: course.program,
    level: course.level,
    section: course.section,
    subject: course.subject ?? undefined,
    course_subjects: course.course_subjects ?? undefined,
    weekday_pattern: course.weekday_pattern,
    time_pattern: course.time_pattern,
    first_event_time_from: course.first_event_time_from,
    first_event_time_to: course.first_event_time_to,
    nextSessionLabel: opts.nextSessionLabel ?? null,
    isShared: opts.isShared,
  };
}
