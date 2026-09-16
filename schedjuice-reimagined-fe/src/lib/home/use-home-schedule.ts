"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { searchEntities } from "@/app/client-api/utils";
import { canAccessStaffShortcuts, isStudent } from "@/helpers/authorization";
import { fetchTeachingCourseIds } from "@/lib/home/fetch-teaching-course-ids";
import { formatSessionClock } from "@/helpers/date";
import {
  classifyEvent,
  ShortcutEventBucket,
} from "@/helpers/shortcuts-event-buckets";
import {
  getTenantDayBoundariesIso,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";

export type HomeScheduleEvent = {
  id: number;
  title: string;
  date: string;
  time_from: string;
  time_to: string;
  courseId: number | null;
  courseTitle: string;
};

type RawEventRow = {
  id: number;
  title: string;
  date: string;
  time_from: string;
  time_to: string;
  course:
    | { id: number; title?: string }
    | number;
};

function mapEventRow(row: RawEventRow): HomeScheduleEvent {
  const course =
    row.course && typeof row.course === "object" ? row.course : null;
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time_from: row.time_from,
    time_to: row.time_to,
    courseId: course?.id ?? (typeof row.course === "number" ? row.course : null),
    courseTitle: course?.title ?? row.title ?? "Course",
  };
}

function mapUserEventsToRows(data: unknown[]): HomeScheduleEvent[] {
  const out: HomeScheduleEvent[] = [];
  for (const raw of data) {
    const ue = raw as { event?: RawEventRow };
    const ev = ue?.event;
    if (!ev || typeof ev.id !== "number") continue;
    out.push(mapEventRow(ev));
  }
  return out;
}

export function useHomeSchedule() {
  const { user } = useUser();
  const { tenant } = useTenant();
  const tz = tenant?.timezone ?? "UTC";
  const todayYmd = useMemo(() => getTenantTodayYmd(tz), [tz]);
  const { startIso, endIso } = useMemo(
    () => getTenantDayBoundariesIso(tz, todayYmd),
    [tz, todayYmd],
  );

  const isStaff = user ? canAccessStaffShortcuts(user) : false;
  const studentUser = user && isStudent(user) && !isStaff;

  const teachingCoursesQuery = useQuery({
    queryKey: ["home-schedule-teaching-courses", user?.id],
    queryFn: () => fetchTeachingCourseIds(user!.id),
    enabled: !!user && isStaff,
  });

  const courseIds = teachingCoursesQuery.data ?? [];

  const staffScopeReady = !teachingCoursesQuery.isLoading;
  const staffEventsEnabled =
    !!user && isStaff && staffScopeReady && courseIds.length > 0;

  const staffEventsQuery = useQuery({
    queryKey: [
      "home-schedule-staff-events",
      todayYmd,
      courseIds.join(","),
      startIso,
      endIso,
    ],
    queryFn: async () => {
      const filter_params = [
        { field_name: "date", operator: operatorEnum.gte, value: startIso },
        { field_name: "date", operator: operatorEnum.lte, value: endIso },
        {
          field_name: "course_id",
          operator: operatorEnum.in,
          value: courseIds.join(","),
        },
      ];
      const res = await searchEntities(
        "events",
        {
          size: -1,
          expand: ["course"],
          sorts: ["time_from", "time_to"],
        },
        { filter_params },
      );
      return ((res.data.data ?? []) as RawEventRow[]).map(mapEventRow);
    },
    enabled: staffEventsEnabled,
  });

  const studentEventsQuery = useQuery({
    queryKey: ["home-schedule-student-events", user?.id, startIso, endIso],
    queryFn: async () => {
      const res = await searchEntities(
        "user-events",
        {
          size: -1,
          expand: ["event", "event.course"],
          sorts: ["event__time_from"],
        },
        {
          filter_params: [
            { field_name: "user_id", operator: operatorEnum.exact, value: String(user!.id) },
            {
              field_name: "event__date",
              operator: operatorEnum.gte,
              value: startIso,
            },
            {
              field_name: "event__date",
              operator: operatorEnum.lte,
              value: endIso,
            },
          ],
        },
      );
      return mapUserEventsToRows(res.data.data ?? []);
    },
    enabled: !!user && Boolean(studentUser),
  });

  const now = useMemo(() => new Date(), []);

  const { activeEvents, sessionCount } = useMemo(() => {
    const rows = isStaff
      ? (staffEventsQuery.data ?? [])
      : (studentEventsQuery.data ?? []);
    const active: HomeScheduleEvent[] = [];
    for (const ev of rows) {
      const bucket = classifyEvent(ev, now, tz);
      if (
        bucket === ShortcutEventBucket.InProgress ||
        bucket === ShortcutEventBucket.Upcoming
      ) {
        active.push(ev);
      }
    }
    active.sort((a, b) => a.time_from.localeCompare(b.time_from));
    return { activeEvents: active, sessionCount: rows.length };
  }, [
    isStaff,
    staffEventsQuery.data,
    studentEventsQuery.data,
    now,
    tz,
  ]);

  const isLoading = isStaff
    ? !staffScopeReady ||
      (staffEventsEnabled && staffEventsQuery.isLoading)
    : Boolean(studentUser) && studentEventsQuery.isLoading;

  return {
    events: activeEvents,
    sessionCount,
    isLoading: Boolean(isLoading),
    timeFormat: resolveTimeDisplayFormat(tenant?.time_display_format),
    formatClock: (timeFrom: string) =>
      formatSessionClock(timeFrom, tenant?.time_display_format),
  };
}
