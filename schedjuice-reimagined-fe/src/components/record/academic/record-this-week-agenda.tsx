"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  filterEventsByCourseIds,
  getUpcomingSessions,
} from "@/helpers/record-academic/calendar-sessions";
import { isSharedCourse } from "@/helpers/record-academic/shared-courses";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";
import { cn } from "@/lib/utils";
import type { TimeDisplayFormatValue } from "@/helpers/time-format";

type Props = {
  events: ProfileCalendarEventLike[];
  courseIds: number[];
  sharedIds: number[];
  tenantTimezone?: string | null;
  timeDisplayFormat?: TimeDisplayFormatValue;
  onViewSchedule: () => void;
};

export function RecordThisWeekAgenda({
  events,
  courseIds,
  sharedIds,
  tenantTimezone,
  timeDisplayFormat = "12h",
  onViewSchedule,
}: Props) {
  const sessions = useMemo(() => {
    const filtered = filterEventsByCourseIds(events, courseIds);
    return getUpcomingSessions(filtered, tenantTimezone, 7, timeDisplayFormat);
  }, [events, courseIds, tenantTimezone, timeDisplayFormat]);

  if (sessions.length === 0) return null;

  return (
    <section className="mt-8 space-y-3 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-serif text-xl text-text-primary">This week</h3>
        <button
          type="button"
          onClick={onViewSchedule}
          className="text-sm text-accent hover:underline"
        >
          View full schedule →
        </button>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border-strong bg-surface-elevated">
        {sessions.map((session) => {
          const shared = isSharedCourse(session.courseId, sharedIds);
          return (
            <li
              key={`${session.courseId}-${session.sortKey}`}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm",
                shared && "border-l-2 border-brand pl-4",
              )}
            >
              <span className="font-mono text-xs tabular-nums text-text-secondary">
                {session.label}
              </span>
              <Link
                href={`/courses/${session.courseId}`}
                className="min-w-0 truncate font-medium text-text-primary hover:text-accent"
              >
                {session.courseTitle}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
