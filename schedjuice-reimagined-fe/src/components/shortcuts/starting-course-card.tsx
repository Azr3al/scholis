"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { CourseRange } from "@/components/course/course-range";
import StatusBadge from "@/components/course/status-badge";
import {
  PrimaryTeacherLine,
  type PrimaryTeacherDisplay,
} from "@/components/course/primary-teacher-line";
import { cn } from "@/lib/utils";
import {
  formatCourseMonthTypeLabel,
  formatSessionClock,
} from "@/helpers/date";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import { formatRepeatEverySummary } from "@/helpers/course-repeat";
import { coursePrimaryTeacherForDisplay } from "@/helpers/course-primary-teacher-display";
import type { categoryType, courseType } from "@/types/course";
import { differenceInCalendarDays, differenceInWeeks } from "date-fns";
import { Calendar as CalendarRange, Clock, OpenNewWindow as ExternalLink, GraduationCap, Group as Users } from "iconoir-react";
import Link from "next/link";

function formatCourseSpan(start: Date, end: Date): string {
  const days = differenceInCalendarDays(end, start) + 1;
  if (!Number.isFinite(days) || days < 1) return "—";
  const weeks = Math.max(1, Math.ceil(differenceInWeeks(end, start)));
  return `${days} day${days === 1 ? "" : "s"} · ~${weeks} week${weeks === 1 ? "" : "s"}`;
}

function getCategoryName(course: courseType): string {
  const c = course.category;
  if (c && typeof c === "object" && "name" in c) {
    return (c as categoryType).name || "Uncategorized";
  }
  return "Uncategorized";
}

export function StartingCourseCard({
  course,
  showFmHmType,
}: {
  course: courseType;
  showFmHmType: boolean;
}) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const start = new Date(course.start_date);
  const end = new Date(course.end_date);
  const hasSchedule =
    Boolean(course.first_event_time_from) &&
    Boolean(course.first_event_time_to);
  const repeatSummary = formatRepeatEverySummary(course.repeat_every);
  const primary = coursePrimaryTeacherForDisplay(
    course.primary_teacher as PrimaryTeacherDisplay | null | undefined,
    course.main_teacher_count,
  );
  const span = formatCourseSpan(start, end);

  return (
    <div className="relative min-w-[200px] max-w-[360px] flex-1 rounded-lg border bg-surface-elevated px-3 py-2.5 text-sm shadow-sm">
      {course.status != null ? (
        <div className="absolute right-2 top-2">
          <StatusBadge status={course.status} />
        </div>
      ) : null}
      <div className={course.status ? "pr-14" : undefined}>
        <div className="font-medium leading-snug line-clamp-2">{course.title}</div>
        <div className="text-text-muted mt-0.5 text-xs line-clamp-1">
          {getCategoryName(course)}
        </div>
        <PrimaryTeacherLine teacher={primary} className="mt-1.5" />
        {hasSchedule ? (
          <div className="mt-2 flex items-start gap-2 text-sm">
            <Clock
              className="mt-0.5 size-4 shrink-0 text-text-muted"
              aria-hidden
            />
            <div>
              <div className="text-text-muted text-xs font-medium">
                Schedule
              </div>
              <p className="tabular-nums leading-snug">
                {formatSessionClock(course.first_event_time_from!, timeFormat)} –{" "}
                {formatSessionClock(course.first_event_time_to!, timeFormat)}
              </p>
            </div>
          </div>
        ) : null}
        {repeatSummary ? (
          <div className="mt-1.5 flex items-start gap-2 text-xs text-text-muted">
            <CalendarRange className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-text-primary/80">Weekly </span>
              {repeatSummary}
            </span>
          </div>
        ) : null}
        <div className="mt-1.5">
          <CourseRange
            startDate={course.start_date}
            endDate={course.end_date}
            className="text-xs"
          />
        </div>
        <div className="mt-1 text-xs text-text-muted">
          <span className="font-medium text-text-primary/80">How long </span>
          {span}
        </div>
        {showFmHmType && course.start_date != null ? (
          <div className="mt-1 text-xs text-text-muted">
            {formatCourseMonthTypeLabel(course.start_date)}
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-text-muted">
          <div className="flex items-center gap-1.5">
            <Users className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="tabular-nums">
              {course.student_count != null
                ? `${course.student_count} student${course.student_count === 1 ? "" : "s"}`
                : "Students not listed"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <GraduationCap className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="tabular-nums text-xs leading-snug">
              {(() => {
                const lead =
                  course.main_teacher_count != null
                    ? course.main_teacher_count
                    : 0;
                const asst =
                  course.assistant_teacher_count != null
                    ? course.assistant_teacher_count
                    : 0;
                const leadLabel =
                  lead === 1 ? "1 main teacher" : `${lead} main teachers`;
                if (asst <= 0) return leadLabel;
                const asstLabel =
                  asst === 1
                    ? "1 assistant"
                    : `${asst} assistants`;
                return `${leadLabel} · ${asstLabel}`;
              })()}
            </span>
          </div>
        </div>
        <div className="mt-2">
          <Link
            href={`/courses/${course.id}`}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "gap-1.5"
            )}
          >
            Open class page
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
