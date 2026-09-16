"use client";

import Link from "next/link";
import { useMemo } from "react";
import { differenceInWeeks } from "date-fns";
import { Clock, GraduationCap, Group as Users } from "iconoir-react";
import StatusBadge from "@/components/course/status-badge";
import { PrimaryTeacherLine } from "@/components/course/primary-teacher-line";
import { coursePrimaryTeacherForDisplay } from "@/helpers/course-primary-teacher-display";
import { CourseIntakeDateContext } from "@/components/course/course-intake-date-context";
import { CourseIdentityBlock } from "@/components/course-identity/course-identity-block";
import { buildCourseBreadcrumb } from "@/helpers/course-identity";
import { formatSessionClock } from "@/helpers/date";
import {
  convertTimePatternToUserTimezone,
  convertWeekdayPatternToUserTimezone,
} from "@/helpers/timeslot";
import { useTenant } from "@/hooks/useTenant";
import { courseType } from "@/types/course";
import { HubStatusFilter } from "@/types/academic-hub";
import { resolveTimeDisplayFormat, orgTimeDateFnsPattern } from "@/helpers/time-format";

function formatMemberCount(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export type HubCourse = courseType & {
  weekday_pattern?: string;
  time_pattern?: string;
};

interface Props {
  course: HubCourse;
  selectedStatuses: HubStatusFilter[];
}

export function AcademicHubCourseCard({ course, selectedStatuses }: Props) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  const breadcrumb = useMemo(() => buildCourseBreadcrumb(course), [course]);

  const matchedOutside =
    selectedStatuses.length > 0 &&
    !selectedStatuses.includes(course.status as HubStatusFilter);

  const categoryName =
    typeof course.category === "object" && course.category !== null
      ? course.category.name
      : undefined;
  const intake =
    typeof course.intake === "object" && course.intake !== null
      ? course.intake
      : null;

  const hasScheduleTimes =
    Boolean(course.first_event_time_from) && Boolean(course.first_event_time_to);

  const startDate = new Date(course.start_date as string | Date);
  const endDate = new Date(course.end_date as string | Date);
  const totalWeeks = Math.max(
    1,
    Math.ceil(differenceInWeeks(endDate, startDate)),
  );

  const statusLabels = selectedStatuses.join(", ");

  return (
    <div className="flex h-full flex-col">
      <Link
        href={`/courses/${course.id}?ref=/courses`}
        className="block min-h-0 flex-1"
      >
        <div className="flex h-full flex-col overflow-hidden border border-border rounded-xl shadow-xs transition-shadow hover:shadow-sm">
          <div className="flex flex-1 flex-col space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              {breadcrumb ? (
                <p className="truncate text-xs text-muted-foreground">
                  {breadcrumb}
                </p>
              ) : (
                <span />
              )}
              <StatusBadge status={course.status} />
            </div>

            <CourseIdentityBlock
              variant="hub"
              course={course}
              showBreadcrumb={false}
            />

            {(categoryName || intake?.name) && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {categoryName && (
                  <span
                    className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("max-w-full truncate font-normal")}
                    title={categoryName}
                  >
                    {categoryName}
                  </span>
                )}
                {intake?.name && (
                  <span className="ml-auto max-w-[40%] truncate text-muted-foreground">
                    {intake.name}
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-1 flex-col space-y-2 p-0 text-sm text-muted-foreground">
              <div className="min-h-5">
                {hasScheduleTimes ? (
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="tabular-nums">
                      {formatSessionClock(course.first_event_time_from!, timeFormat)} –{" "}
                      {formatSessionClock(course.first_event_time_to!, timeFormat)}
                    </span>
                  </div>
                ) : course.time_pattern ? (
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {convertTimePatternToUserTimezone(
                        course.time_pattern,
                        tenant?.timezone,
                        orgTimeDateFnsPattern(timeFormat),
                      )}
                    </span>
                  </div>
                ) : null}
              </div>
              {course.weekday_pattern && (
                <p className="text-xs">
                  {convertWeekdayPatternToUserTimezone(
                    course.weekday_pattern,
                    tenant?.timezone,
                  )}
                </p>
              )}
              <CourseIntakeDateContext
                courseDates={{
                  start_date: course.start_date,
                  end_date: course.end_date,
                }}
                intakeDates={
                  intake?.start_date && intake?.end_date
                    ? {
                        start_date: intake.start_date,
                        end_date: intake.end_date,
                      }
                    : null
                }
              />
              <p className="text-xs">{totalWeeks} weeks</p>
              <PrimaryTeacherLine
                teacher={coursePrimaryTeacherForDisplay(
                  course.primary_teacher ?? null,
                  course.main_teacher_count,
                )}
                className="pt-0.5"
              />
              <div className="mt-auto space-y-2 pt-1">
                <div className="flex flex-wrap gap-3">
                  <span className="flex items-center gap-1 tabular-nums">
                    <Users className="size-4 shrink-0 text-primary" aria-hidden />
                    {formatMemberCount(
                      course.student_count ?? 0,
                      "student",
                      "students",
                    )}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <GraduationCap
                      className="size-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    {formatMemberCount(
                      course.main_teacher_count ?? 0,
                      "teacher",
                      "teachers",
                    )}
                  </span>
                </div>
                {course.created_by?.name && (
                  <p className="text-xs text-muted-foreground">
                    Created by{" "}
                    <span className="text-foreground/90">
                      {course.created_by.name}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
      {matchedOutside && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Matched outside {statusLabels}
        </p>
      )}
    </div>
  );
}
