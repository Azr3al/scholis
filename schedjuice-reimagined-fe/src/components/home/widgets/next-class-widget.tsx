"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { searchEntities } from "@/app/client-api/utils";
import { classifyEvent, ShortcutEventBucket } from "@/helpers/shortcuts-event-buckets";
import {
  eventInstantInTimezone,
  getTenantDayBoundariesIso,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";
import { formatTimeslotRangeForDisplay } from "@/helpers/timeslot";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import {
  courseIdFromProfileEvent,
  flattenCourseEventsFromCoursesQuery,
  ProfileCalendarEventLike,
} from "@/helpers/user-profile";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { operatorEnum } from "@/types/api";
import { DashboardCard } from "../dashboard-card";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";

type ScheduleEvent = ProfileCalendarEventLike & {
  date: string;
  time_from: string;
  time_to: string;
};

function isClassSession(e: ProfileCalendarEventLike): e is ScheduleEvent {
  if (e.type === "assignment_available" || e.type === "assignment_due") {
    return false;
  }
  return Boolean(e.date && e.time_from && e.time_to);
}

function courseTitleFromEvent(ev: ScheduleEvent): string {
  if (ev.courseTitle?.trim()) return ev.courseTitle;
  const c = ev.course;
  if (c != null && typeof c === "object" && "title" in c && c.title) {
    return String(c.title);
  }
  if (ev.title?.trim()) return ev.title;
  return "Course";
}

export default function NextClassWidget() {
  const { user, isLoading: userLoading } = useUser();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const userId = user?.id != null ? String(user.id) : "";
  const tz = tenant?.timezone ?? "UTC";
  const todayYmd = useMemo(() => getTenantTodayYmd(tz), [tz]);
  const { startIso } = useMemo(
    () => getTenantDayBoundariesIso(tz, todayYmd),
    [tz, todayYmd],
  );

  const courseEventsQuery = useQuery({
    queryKey: ["widget-next-class-courses", userId],
    queryFn: () =>
      searchEntities(
        "courses",
        {
          expand: ["events"],
          size: -1,
          fields: ["id", "title", "events"],
        },
        {
          filter_params: [
            {
              field_name: "user_courses__user_id",
              operator: operatorEnum.exact,
              value: userId,
            },
          ],
        },
      ),
    enabled: isValidApiEntityIdParam(userId),
  });

  const userEventsQuery = useQuery({
    queryKey: ["widget-next-class-user-events", userId, startIso],
    queryFn: async () => {
      const res = await searchEntities(
        "user-events",
        {
          size: -1,
          expand: ["event", "event.course"],
          sorts: ["event__date", "event__time_from"],
        },
        {
          filter_params: [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: userId,
            },
            {
              field_name: "event__date",
              operator: operatorEnum.gte,
              value: startIso,
            },
          ],
        },
      );
      return (res.data?.data ?? []) as unknown[];
    },
    enabled: isValidApiEntityIdParam(userId),
  });

  const nextClass = useMemo(() => {
    const now = new Date();
    const candidates: ScheduleEvent[] = [];

    candidates.push(
      ...flattenCourseEventsFromCoursesQuery(
        courseEventsQuery.data?.data?.data as unknown[] | undefined,
      ).filter(isClassSession),
    );

    for (const raw of userEventsQuery.data ?? []) {
      const ue = raw as {
        event?: ScheduleEvent & {
          course?: number | { id?: number; title?: string };
        };
      };
      const ev = ue?.event;
      if (!ev?.date || !ev?.time_from || !ev?.time_to) continue;

      const courseObj =
        typeof ev.course === "object" && ev.course != null ? ev.course : null;
      const courseId =
        typeof ev.course === "number"
          ? ev.course
          : courseObj?.id != null
            ? courseObj.id
            : null;

      candidates.push({
        ...ev,
        course:
          courseId != null
            ? courseObj?.title
              ? { id: courseId, title: courseObj.title }
              : courseId
            : ev.course,
        courseTitle: courseObj?.title ?? ev.title,
      });
    }

    const seen = new Set<string>();
    const upcoming: { event: ScheduleEvent; start: Date }[] = [];

    for (const ev of candidates) {
      const key =
        ev.id != null
          ? `id:${ev.id}`
          : `${ev.date}|${ev.time_from}|${ev.time_to}|${ev.title ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const bucket = classifyEvent(ev, now, tz);
      if (
        bucket !== ShortcutEventBucket.Upcoming &&
        bucket !== ShortcutEventBucket.InProgress
      ) {
        continue;
      }

      const start = eventInstantInTimezone(ev.date, ev.time_from, tz);
      if (!start) continue;
      upcoming.push({ event: ev, start });
    }

    upcoming.sort((a, b) => a.start.getTime() - b.start.getTime());
    return upcoming[0] ?? null;
  }, [courseEventsQuery.data, userEventsQuery.data, tz]);

  const loading =
    userLoading || courseEventsQuery.isLoading || userEventsQuery.isLoading;
  const error =
    courseEventsQuery.isError || userEventsQuery.isError
      ? "Could not load schedule."
      : undefined;
  const courseId = nextClass ? courseIdFromProfileEvent(nextClass.event) : null;

  return (
    <DashboardCard
      title="Your next class"
      span="md"
      loading={loading}
      empty={!loading && !error && !nextClass}
      error={error}
    >
      {nextClass ? (
        <div className="space-y-3">
          <div>
            <p className="font-medium">{courseTitleFromEvent(nextClass.event)}</p>
            <p className="text-sm text-text-muted">
              {format(nextClass.start, "EEE, MMM d")} ·{" "}
              <span className="font-mono">
                {formatTimeslotRangeForDisplay(
                  {
                    date: nextClass.event.date,
                    time_from: nextClass.event.time_from,
                    time_to: nextClass.event.time_to,
                  },
                  tz,
                  orgTimeDateFnsPattern(timeFormat),
                )}
              </span>
            </p>
          </div>
          {courseId != null ? (
            <Link
              href={`/courses/${courseId}`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              View course
            </Link>
          ) : null}
        </div>
      ) : null}
    </DashboardCard>
  );
}
