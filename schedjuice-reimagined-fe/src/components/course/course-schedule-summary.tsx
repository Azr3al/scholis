"use client";

import { Calendar as CalendarRange, Clock } from "iconoir-react";

import { CourseRange } from "@/components/course/course-range";
import { formatCourseWeeklySchedule } from "@/helpers/course-repeat";
import { formatSessionClock } from "@/helpers/date";
import type { SessionOption } from "@/helpers/course/session-grouping";
import {
  formatOrgTimeRange,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import { cn } from "@/lib/utils";
import type { courseType } from "@/types/course";

export type CourseScheduleSummaryProps = {
  course: Pick<
    courseType,
    | "title"
    | "start_date"
    | "end_date"
    | "repeat_every"
    | "first_event_time_from"
    | "first_event_time_to"
  >;
  sessions?: SessionOption[];
  timeFormat: TimeDisplayFormatValue;
  className?: string;
};

function resolveSessionClock(
  course: CourseScheduleSummaryProps["course"],
  sessions: SessionOption[] | undefined,
  timeFormat: TimeDisplayFormatValue,
): string | null {
  if (course.first_event_time_from && course.first_event_time_to) {
    return `${formatSessionClock(course.first_event_time_from, timeFormat)} – ${formatSessionClock(course.first_event_time_to, timeFormat)}`;
  }
  const first = sessions?.[0];
  if (first?.timeFrom && first?.timeTo) {
    return formatOrgTimeRange(first.timeFrom, first.timeTo, timeFormat);
  }
  return null;
}

export function CourseScheduleSummary({
  course,
  sessions,
  timeFormat,
  className,
}: CourseScheduleSummaryProps) {
  const repeatSummary = formatCourseWeeklySchedule(course.repeat_every);
  const clockLabel = resolveSessionClock(course, sessions, timeFormat);
  const hasDates = course.start_date != null && course.end_date != null;

  if (!course.title && !repeatSummary && !clockLabel && !hasDates) {
    return null;
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border bg-surface px-4 py-3",
        className,
      )}
    >
      {course.title ? (
        <p className="line-clamp-1 font-medium text-sm text-text-primary">
          {course.title}
        </p>
      ) : null}
      {repeatSummary ? (
        <div className="flex items-start gap-2 text-sm text-text-secondary">
          <CalendarRange
            className="mt-0.5 size-4 shrink-0 text-text-muted"
            aria-hidden
          />
          <span>
            <span className="font-medium text-text-primary/80">Weekly </span>
            {repeatSummary}
          </span>
        </div>
      ) : null}
      {clockLabel ? (
        <div className="flex items-start gap-2 text-sm text-text-secondary">
          <Clock className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
          <span>
            <span className="font-medium text-text-primary/80">Time </span>
            <span className="tabular-nums">{clockLabel}</span>
          </span>
        </div>
      ) : null}
      {hasDates ? (
        <CourseRange
          startDate={course.start_date}
          endDate={course.end_date}
          className="text-xs"
        />
      ) : null}
    </div>
  );
}
