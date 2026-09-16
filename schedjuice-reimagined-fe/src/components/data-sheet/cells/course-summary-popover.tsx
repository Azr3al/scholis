"use client";
import { Button, Skeleton } from "@/components/primitives";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { differenceInWeeks } from "date-fns";
import { Clock, OpenNewWindow as ExternalLink, GraduationCap, Group as Users } from "iconoir-react";
import { useQuery } from "@tanstack/react-query";

import { fetchEntity } from "@/app/client-api/utils";
import type { HubCourse } from "@/components/academic-hub/course-card";
import { CourseIntakeDateContext } from "@/components/course/course-intake-date-context";
import { PrimaryTeacherLine } from "@/components/course/primary-teacher-line";
import { coursePrimaryTeacherForDisplay } from "@/helpers/course-primary-teacher-display";
import StatusBadge from "@/components/course/status-badge";
import { buildCourseBreadcrumb } from "@/helpers/course-identity";
import { formatSessionClock } from "@/helpers/date";
import {
  convertTimePatternToUserTimezone,
  convertWeekdayPatternToUserTimezone,
} from "@/helpers/timeslot";
import { useTenant } from "@/hooks/useTenant";
import { resolveTimeDisplayFormat, orgTimeDateFnsPattern } from "@/helpers/time-format";

export type CourseSummaryTarget = {
  courseId: number;
  rect: { x: number; y: number; width: number; height: number };
};

const CARD_WIDTH = 340;
const VIEWPORT_PADDING = 8;
const ANCHOR_GAP = 4;

function clampPopoverPosition(
  rect: CourseSummaryTarget["rect"],
  cardHeight: number,
): { left: number; top: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.x;
  let top = rect.y + rect.height + ANCHOR_GAP;

  if (left + CARD_WIDTH + VIEWPORT_PADDING > viewportWidth) {
    left = Math.max(
      VIEWPORT_PADDING,
      viewportWidth - CARD_WIDTH - VIEWPORT_PADDING,
    );
  }
  if (left < VIEWPORT_PADDING) {
    left = VIEWPORT_PADDING;
  }

  if (top + cardHeight + VIEWPORT_PADDING > viewportHeight) {
    const above = rect.y - cardHeight - ANCHOR_GAP;
    if (above >= VIEWPORT_PADDING) {
      top = above;
    } else {
      top = Math.max(
        VIEWPORT_PADDING,
        viewportHeight - cardHeight - VIEWPORT_PADDING,
      );
    }
  }

  return { left, top };
}

function formatMemberCount(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function CourseSummaryBody({ course }: { course: HubCourse }) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  const breadcrumb = useMemo(() => buildCourseBreadcrumb(course), [course]);
  const subjectName =
    typeof course.subject === "object" && course.subject !== null
      ? course.subject.name
      : undefined;
  const intake =
    typeof course.intake === "object" && course.intake !== null
      ? course.intake
      : null;

  const hasScheduleTimes =
    Boolean(course.first_event_time_from) && Boolean(course.first_event_time_to);

  const totalWeeks =
    course.start_date && course.end_date
      ? Math.max(
          1,
          Math.ceil(
            differenceInWeeks(
              new Date(course.end_date as string | Date),
              new Date(course.start_date as string | Date),
            ),
          ),
        )
      : null;

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        {breadcrumb ? (
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {breadcrumb}
          </p>
        ) : (
          <span />
        )}
        <StatusBadge status={course.status} />
      </div>

      <div className="space-y-0.5">
        <h3 className="text-base font-semibold leading-snug">{course.title}</h3>
        {course.code ? (
          <p className="font-mono text-xs text-muted-foreground">{course.code}</p>
        ) : null}
      </div>

      {subjectName ? (
        <p className="text-xs text-muted-foreground">{subjectName}</p>
      ) : null}

      <div className="space-y-2 text-sm text-muted-foreground">
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

        {course.weekday_pattern ? (
          <p className="text-xs">
            {convertWeekdayPatternToUserTimezone(
              course.weekday_pattern,
              tenant?.timezone,
            )}
          </p>
        ) : null}

        {course.start_date && course.end_date ? (
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
        ) : null}

        {totalWeeks != null ? (
          <p className="text-xs">{totalWeeks} weeks</p>
        ) : null}

        <PrimaryTeacherLine
          teacher={coursePrimaryTeacherForDisplay(
            course.primary_teacher ?? null,
            course.main_teacher_count,
          )}
          className="pt-0.5"
        />

        {(course.student_count != null || course.main_teacher_count != null) && (
          <div className="flex flex-wrap gap-3 pt-1">
            {course.student_count != null ? (
              <span className="flex items-center gap-1 tabular-nums text-xs">
                <Users className="size-4 shrink-0 text-primary" aria-hidden />
                {formatMemberCount(
                  course.student_count,
                  "student",
                  "students",
                )}
              </span>
            ) : null}
            {course.main_teacher_count != null ? (
              <span className="flex items-center gap-1 tabular-nums text-xs">
                <GraduationCap
                  className="size-4 shrink-0 text-primary"
                  aria-hidden
                />
                {formatMemberCount(
                  course.main_teacher_count,
                  "teacher",
                  "teachers",
                )}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function CourseSummaryPopover({
  target,
  onClose,
}: {
  target: CourseSummaryTarget | null;
  onClose: () => void;
}) {
  const courseId = target?.courseId ?? null;
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );

  const courseQuery = useQuery({
    queryKey: ["course-summary", courseId],
    queryFn: async () => {
      const res = await fetchEntity("courses", courseId!, [
        "program",
        "subject",
        "primary_teacher",
        "created_by",
        "intake",
        "level",
        "section",
      ]);
      return (res.data?.data ?? null) as HubCourse | null;
    },
    enabled: courseId != null,
  });

  const course = courseQuery.data;

  useLayoutEffect(() => {
    if (!target || !contentRef.current) {
      setPosition(null);
      return;
    }
    const height = contentRef.current.offsetHeight;
    setPosition(clampPopoverPosition(target.rect, height));
  }, [
    target,
    courseQuery.isLoading,
    courseQuery.isError,
    courseQuery.data,
  ]);

  useEffect(() => {
    if (!target) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!contentRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, target]);

  if (!target) return null;

  const initialTop = target.rect.y + target.rect.height + ANCHOR_GAP;

  return (
    <div
      ref={contentRef}
      data-course-summary-popover
      className="click-outside-ignore fixed z-dropdown w-[340px] overflow-hidden rounded-lg border border-border bg-surface-elevated text-text-primary shadow-md"
      style={{
        left: position?.left ?? target.rect.x,
        top: position?.top ?? initialTop,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {courseQuery.isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : courseQuery.isError || !course ? (
        <p className="p-4 text-sm text-destructive" role="alert">
          Could not load course details.
        </p>
      ) : (
        <CourseSummaryBody course={course} />
      )}

      <div className="border-t px-4 py-3">
        <Button
          type="button"
          size="sm"
          className="w-full gap-2"
          onClick={() => {
            window.open(`/courses/${target.courseId}`, "_blank");
            onClose();
          }}
        >
          Open in new tab
          <ExternalLink className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
