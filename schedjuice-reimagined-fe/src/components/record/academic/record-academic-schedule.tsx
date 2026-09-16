"use client";

import { useMemo, useState } from "react";
import { UserCalendar } from "@/components/calendar/calendars/user-calendar";
import { CalendarView } from "@/components/calendar/types";
import { filterEventsByCourseIds } from "@/helpers/record-academic/calendar-sessions";
import { courseIdFromProfileEvent, type ProfileCalendarEventLike } from "@/helpers/user-profile";
import { eventType } from "@/types/course";
import { cn } from "@/lib/utils";

type Props = {
  events: ProfileCalendarEventLike[];
  isLoading: boolean;
  loadError?: boolean;
  onRetry?: () => void;
  renderCalendarEvent?: (event: eventType) => React.ReactNode;
  sharedIds: number[];
  hasSharedCourses: boolean;
};

export function RecordAcademicSchedule({
  events,
  isLoading,
  loadError,
  onRetry,
  renderCalendarEvent,
  sharedIds,
  hasSharedCourses,
}: Props) {
  const [yourClassesOnly, setYourClassesOnly] = useState(hasSharedCourses);

  const displayEvents = useMemo(() => {
    if (!yourClassesOnly || !sharedIds.length) return events;
    return filterEventsByCourseIds(events, sharedIds);
  }, [events, yourClassesOnly, sharedIds]);

  const wrappedRenderEvent = useMemo(() => {
    if (!renderCalendarEvent) return undefined;
    return function SharedAwareCalendarEvent(event: eventType) {
      const courseId = courseIdFromProfileEvent(event as ProfileCalendarEventLike);
      const isShared = courseId != null && sharedIds.includes(courseId);
      const inner = renderCalendarEvent(event);
      if (!isShared) return inner;
      return <div className="rounded-md bg-brand/8 px-1 py-0.5">{inner}</div>;
    };
  }, [renderCalendarEvent, sharedIds]);

  return (
    <div className="space-y-4">
      {hasSharedCourses ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setYourClassesOnly(true)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs transition-colors",
              yourClassesOnly
                ? "bg-accent text-accent-foreground"
                : "bg-surface-hover text-text-secondary hover:text-text-primary",
            )}
          >
            Your classes only
          </button>
          <button
            type="button"
            onClick={() => setYourClassesOnly(false)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs transition-colors",
              !yourClassesOnly
                ? "bg-accent text-accent-foreground"
                : "bg-surface-hover text-text-secondary hover:text-text-primary",
            )}
          >
            All sessions
          </button>
        </div>
      ) : null}
      <UserCalendar
        embedded
        events={displayEvents as eventType[]}
        isLoading={isLoading}
        loadError={loadError}
        onRetry={onRetry}
        renderEvent={wrappedRenderEvent}
        defaultView={CalendarView.WEEK}
        showableViews={[CalendarView.WEEK, CalendarView.MONTH, CalendarView.LIST]}
      />
    </div>
  );
}
