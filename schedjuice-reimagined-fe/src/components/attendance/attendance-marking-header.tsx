"use client";
import { Button, Skeleton } from "@/components/primitives";

import Link from "next/link";
import { formatSessionLabel, type MarkingEvent } from "@/helpers/attendance-marking";
import type { courseType } from "@/types/course";
import { NavArrowLeft, NavArrowRight, Notes } from "iconoir-react";
import { TeachingDayCalendar } from "./teaching-day-calendar";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";

type AttendanceMarkingHeaderProps = {
  courseId: string;
  course: courseType | null;
  events: MarkingEvent[];
  eventIndex: number;
  pathname: string;
  currentEvent: MarkingEvent | undefined;
  pageDateLabel: string | null;
  isViewingToday: boolean;
  todayLabel: string;
  timezone: string;
  prevTeachingDayIndex: number | null;
  nextTeachingDayIndex: number | null;
  isBootstrapLoading?: boolean;
  onGoToToday: () => void;
  onChangeEventIndex: (index: number) => void;
};

function CalendarTriggerSkeleton() {
  return (
    <div
      className="flex h-auto min-w-[220px] max-w-[min(100vw-2rem,320px)] flex-col items-start gap-1.5 rounded-md border border-border-subtle bg-surface-elevated px-4 py-3"
      aria-hidden
    >
      <Skeleton className="h-3 w-40 motion-reduce:animate-none" />
      <Skeleton className="h-5 w-52 motion-reduce:animate-none" />
      <Skeleton className="h-3 w-32 motion-reduce:animate-none" />
    </div>
  );
}

export function AttendanceMarkingHeader({
  courseId,
  course,
  events,
  eventIndex,
  pathname,
  currentEvent,
  pageDateLabel,
  isViewingToday,
  todayLabel,
  timezone,
  prevTeachingDayIndex,
  nextTeachingDayIndex,
  isBootstrapLoading = false,
  onGoToToday,
  onChangeEventIndex,
}: AttendanceMarkingHeaderProps) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const sessionMeta = currentEvent
    ? [formatSessionLabel(currentEvent, timeFormat), course?.title].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="space-y-4" data-testid="attendance-marking-header">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/courses/${courseId}/attendance`}
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary"
          >
            <NavArrowLeft width={16} height={16} aria-hidden />
            Back to attendance dashboard
          </Link>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Mark attendance
          </p>
          {isBootstrapLoading ? (
            <>
              <Skeleton className="h-8 w-72 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-56 motion-reduce:animate-none" />
            </>
          ) : (
            <>
              {pageDateLabel ? (
                <h1 className="font-serif text-2xl text-text-primary">{pageDateLabel}</h1>
              ) : null}
              {sessionMeta ? (
                <p className="text-sm text-text-muted">{sessionMeta}</p>
              ) : null}
            </>
          )}
        </div>

        {isBootstrapLoading ? (
          <Skeleton className="h-9 w-28 shrink-0 motion-reduce:animate-none" aria-hidden />
        ) : currentEvent?.id ? (
          <Link
            href={`/courses/${courseId}/daily-notes/${currentEvent.id}?ref=${encodeURIComponent(pathname)}`}
          >
            <Button variant="secondary" size="sm" className="gap-2">
              <Notes width={16} height={16} aria-hidden />
              Daily note
            </Button>
          </Link>
        ) : null}
      </div>

      {!isViewingToday && events.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onGoToToday}
            className="inline-flex items-center gap-1 text-sm text-accent underline-offset-2 hover:underline"
          >
            Go to today ({todayLabel})
            <NavArrowRight width={14} height={14} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={prevTeachingDayIndex == null}
          onClick={() => {
            if (prevTeachingDayIndex != null) onChangeEventIndex(prevTeachingDayIndex);
          }}
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
          Previous day
        </Button>

        {isBootstrapLoading ? (
          <CalendarTriggerSkeleton />
        ) : (
          <TeachingDayCalendar
            events={events}
            selectedEventIndex={eventIndex}
            onSelectEventIndex={onChangeEventIndex}
            courseStartDate={course?.start_date}
            courseEndDate={course?.end_date}
            timezone={timezone}
            disabled={events.length === 0}
          />
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={nextTeachingDayIndex == null}
          onClick={() => {
            if (nextTeachingDayIndex != null) onChangeEventIndex(nextTeachingDayIndex);
          }}
        >
          Next day
          <NavArrowRight width={16} height={16} aria-hidden />
        </Button>
      </div>

      <div className="border-b border-border-subtle" />
    </div>
  );
}
