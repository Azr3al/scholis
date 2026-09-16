import { nextSessionLabelForCourse } from "@/helpers/record-academic/calendar-sessions";
import type { TimeDisplayFormatValue } from "@/helpers/time-format";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";
import type { RecordCourseRowData } from "@/components/record/academic/record-course-row";
import { seniorityEnum } from "@/types/course";

type SearchCourse = {
  id: number;
  title?: string | null;
  code?: string | null;
  status?: RecordCourseRowData["status"];
  program?: RecordCourseRowData["program"];
  level?: RecordCourseRowData["level"];
  section?: RecordCourseRowData["section"];
  subject?: RecordCourseRowData["subject"];
  course_subjects?: RecordCourseRowData["course_subjects"];
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
};

type EnrollmentRow = {
  id: number;
  course?: SearchCourse | number | null;
  assigned_as_role?: { name?: string; seniority?: string | null } | null;
};

function roleSeniorityRank(seniority: string | null | undefined): number {
  if (seniority === seniorityEnum.MAIN_TEACHER) return 0;
  if (seniority === seniorityEnum.ASSISTANT_TEACHER) return 1;
  return 2;
}

function enrollmentByCourseId(
  enrollments: EnrollmentRow[],
): Map<number, EnrollmentRow> {
  const map = new Map<number, EnrollmentRow>();
  for (const row of enrollments) {
    const c = row.course;
    const id =
      typeof c === "object" && c != null
        ? c.id
        : typeof c === "number"
          ? c
          : null;
    if (id != null) map.set(id, row);
  }
  return map;
}

export interface MergeSearchWithEnrollmentsArgs {
  courses: SearchCourse[];
  enrollments: EnrollmentRow[];
  sharedIds: number[];
  calendarEvents: ProfileCalendarEventLike[];
  tenantTimezone?: string | null;
  sessionByCourseId?: Map<number, string>;
  timeDisplayFormat?: TimeDisplayFormatValue;
}

export function mergeSearchWithEnrollments(
  args: MergeSearchWithEnrollmentsArgs,
): (RecordCourseRowData & { roleSeniority?: string | null })[] {
  const byCourseId = enrollmentByCourseId(args.enrollments);
  const shared = new Set(args.sharedIds);

  const rows = args.courses.flatMap((course) => {
    const courseId = course.id;
    if (courseId == null) return [];
    const enrollment = byCourseId.get(courseId);
    if (!enrollment) return [];

    return [
      {
        userCourseId: enrollment.id,
        courseId,
        title: course.title ?? "Untitled course",
        code: course.code ?? null,
        status: course.status,
        assignedRoleName: enrollment.assigned_as_role?.name,
        roleSeniority: enrollment.assigned_as_role?.seniority,
        program: course.program,
        level: course.level,
        section: course.section,
        subject: course.subject ?? undefined,
        course_subjects: course.course_subjects ?? undefined,
        weekday_pattern: course.weekday_pattern,
        time_pattern: course.time_pattern,
        first_event_time_from: course.first_event_time_from,
        first_event_time_to: course.first_event_time_to,
        nextSessionLabel: nextSessionLabelForCourse(
          courseId,
          args.calendarEvents,
          args.tenantTimezone,
          args.sessionByCourseId,
          args.timeDisplayFormat,
        ),
        isShared: shared.has(courseId),
      },
    ];
  });

  return rows.sort(
    (a, b) =>
      roleSeniorityRank(a.roleSeniority) - roleSeniorityRank(b.roleSeniority),
  );
}
