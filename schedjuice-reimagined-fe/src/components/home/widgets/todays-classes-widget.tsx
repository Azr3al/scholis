"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { searchEntities } from "@/app/client-api/utils";
import {
  getCourseId,
  getCourseTitle,
  type ShortcutSessionEventRow,
} from "@/components/shortcuts/shortcut-session-section";
import { formatSessionClock } from "@/helpers/date";
import { hasSchoolWideCourseAccess, isStudent } from "@/helpers/authorization";
import {
  classifyEvent,
  ShortcutEventBucket,
} from "@/helpers/shortcuts-event-buckets";
import {
  eventInstantInTimezone,
  getTenantDayBoundariesIso,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import { DashboardCard } from "../dashboard-card";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";

type EventRow = ShortcutSessionEventRow;

function attendanceHref(ev: EventRow): string | null {
  const cid = getCourseId(ev.course);
  if (cid == null) return null;
  return `/courses/${cid}/attendance/marking/0`;
}

export default function TodaysClassesWidget() {
  const { user } = useUser();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const tz = tenant?.timezone ?? "UTC";
  const todayYmd = getTenantTodayYmd(tz);
  const seesAllCourses = user ? hasSchoolWideCourseAccess(user) : false;

  const coursesQuery = useQuery({
    queryKey: ["widget-todays-classes-courses", user?.id],
    queryFn: async () => {
      const res = await searchEntities(
        "courses",
        { size: -1, fields: ["id"] },
        {},
      );
      return (res.data.data ?? []) as { id: number }[];
    },
    enabled: !!user && !isStudent(user) && !seesAllCourses,
  });

  const courseIds = useMemo(
    () => coursesQuery.data?.map((c) => c.id) ?? [],
    [coursesQuery.data],
  );

  const { startIso, endIso } = useMemo(
    () => getTenantDayBoundariesIso(tz, todayYmd),
    [tz, todayYmd],
  );

  const scopeReady = seesAllCourses || !coursesQuery.isLoading;
  const eventsEnabled =
    !!user &&
    !isStudent(user) &&
    scopeReady &&
    (seesAllCourses || courseIds.length > 0);

  const eventsQuery = useQuery({
    queryKey: [
      "widget-todays-classes-events",
      todayYmd,
      seesAllCourses,
      courseIds.join(","),
    ],
    queryFn: async () => {
      const filter_params = [
        {
          field_name: "date",
          operator: operatorEnum.gte,
          value: startIso,
        },
        {
          field_name: "date",
          operator: operatorEnum.lte,
          value: endIso,
        },
      ];
      if (!seesAllCourses && courseIds.length) {
        filter_params.push({
          field_name: "course_id",
          operator: operatorEnum.in,
          value: courseIds.join(","),
        });
      }
      const res = await searchEntities(
        "events",
        {
          size: -1,
          expand: ["course"],
          sorts: ["time_from", "time_to"],
        },
        { filter_params },
      );
      return (res.data.data ?? []) as EventRow[];
    },
    enabled: eventsEnabled,
  });

  const now = useMemo(() => new Date(), []);

  const { total, nextSessions, ctaHref } = useMemo(() => {
    const rows = eventsQuery.data ?? [];
    const inProgress: EventRow[] = [];
    const upcoming: EventRow[] = [];
    for (const ev of rows) {
      const bucket = classifyEvent(ev, now, tz);
      if (bucket === ShortcutEventBucket.InProgress) inProgress.push(ev);
      else if (bucket === ShortcutEventBucket.Upcoming) upcoming.push(ev);
    }
    const ordered = [...inProgress, ...upcoming].sort((a, b) => {
      const ta =
        eventInstantInTimezone(a.date, a.time_from, tz)?.getTime() ?? 0;
      const tb =
        eventInstantInTimezone(b.date, b.time_from, tz)?.getTime() ?? 0;
      return ta - tb;
    });
    const first = ordered[0];
    return {
      total: rows.length,
      nextSessions: ordered.slice(0, 2),
      ctaHref: first ? attendanceHref(first) : null,
    };
  }, [eventsQuery.data, now, tz]);

  const loading =
    !user ||
    isStudent(user) ||
    (!seesAllCourses && coursesQuery.isLoading) ||
    eventsQuery.isLoading;
  const error =
    eventsQuery.isError ? "Could not load today's sessions." : undefined;
  const empty = !loading && !error && total === 0;

  return (
    <DashboardCard
      title="Today's classes"
      span="lg"
      loading={loading}
      empty={empty}
      error={error}
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs text-text-muted">Sessions today</p>
          <p className="font-mono text-3xl font-semibold tabular-nums">{total}</p>
        </div>
        {nextSessions.length > 0 && (
          <ul className="space-y-2 text-sm">
            {nextSessions.map((ev) => (
              <li key={ev.id} className="text-text-muted">
                <span className="font-medium text-text-primary">
                  {getCourseTitle(ev.course)}
                </span>
                {" · "}
                {formatSessionClock(ev.time_from, timeFormat)} –{" "}
                {formatSessionClock(ev.time_to, timeFormat)}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {ctaHref ? (
            <Link
              href={ctaHref}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
              )}
            >
              Take attendance
            </Link>
          ) : null}
          <Link
            href="/shortcuts/todays-classes"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            View schedule
          </Link>
        </div>
      </div>
    </DashboardCard>
  );
}
