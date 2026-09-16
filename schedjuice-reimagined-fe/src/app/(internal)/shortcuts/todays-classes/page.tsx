"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { searchEntities } from "@/app/client-api/utils";
import {
  ShortcutSessionSection,
  type ShortcutSessionEventRow,
} from "@/components/shortcuts/shortcut-session-section";
import { ListRowsSkeleton, StatCardsSkeleton } from "@/components/loading/structured-skeletons";
import { DatePicker } from "@/components/date/date-picker";
import {
  canAccessStaffShortcuts,
  hasSchoolWideCourseAccess,
} from "@/helpers/authorization";
import { formatClassesShortcutDayTitle } from "@/helpers/date";
import {
  classifyEvent,
  ShortcutEventBucket,
} from "@/helpers/shortcuts-event-buckets";
import {
  addCalendarDaysToTenantYmd,
  eventInstantInTimezone,
  getTenantDayBoundariesIso,
  getTenantRelativeDay,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { format, parse } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Skeleton } from "@/components/primitives";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";

type EventRow = ShortcutSessionEventRow;

function pageTitleForDay(selectedYmd: string, tz: string): string {
  const rel = getTenantRelativeDay(selectedYmd, tz);
  if (rel === "today") return "Today's classes";
  if (rel === "yesterday") return "Yesterday's classes";
  if (rel === "tomorrow") return "Tomorrow's classes";
  return `${formatClassesShortcutDayTitle(selectedYmd)}'s classes`;
}

const TodaysClassesPage = () => {
  const { user, isLoading: userLoading } = useUser();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const router = useRouter();
  const tz = tenant?.timezone ?? "UTC";

  const [selectedYmd, setSelectedYmd] = useState<string>("");

  useEffect(() => {
    setSelectedYmd(getTenantTodayYmd(tz));
  }, [tz]);

  useEffect(() => {
    if (!userLoading && user && !canAccessStaffShortcuts(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  const seesAllCourses = user ? hasSchoolWideCourseAccess(user) : false;

  const coursesQuery = useQuery({
    queryKey: ["shortcuts-todays-scope-courses"],
    queryFn: async () => {
      const res = await searchEntities(
        "courses",
        { size: -1, fields: ["id"] },
        {},
      );
      return (res.data.data ?? []) as { id: number }[];
    },
    enabled: !!user && canAccessStaffShortcuts(user) && !seesAllCourses,
  });

  const courseIds = useMemo(
    () => coursesQuery.data?.map((c) => c.id) ?? [],
    [coursesQuery.data],
  );

  const ymdForQuery = selectedYmd || getTenantTodayYmd(tz);
  const { startIso, endIso } = useMemo(
    () => getTenantDayBoundariesIso(tz, ymdForQuery),
    [tz, ymdForQuery],
  );

  const scopeReady = seesAllCourses || !coursesQuery.isLoading;
  const eventsEnabled =
    !!user &&
    canAccessStaffShortcuts(user) &&
    scopeReady &&
    selectedYmd !== "" &&
    (seesAllCourses || courseIds.length > 0);

  const eventsQuery = useQuery({
    queryKey: [
      "shortcuts-todays-events",
      ymdForQuery,
      seesAllCourses,
      courseIds.join(","),
      startIso,
      endIso,
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

  const { inProgress, upcoming, completed } = useMemo(() => {
    const rows = eventsQuery.data ?? [];
    const a: EventRow[] = [];
    const b: EventRow[] = [];
    const c: EventRow[] = [];
    for (const ev of rows) {
      const bucket = classifyEvent(ev, now, tz);
      if (bucket === ShortcutEventBucket.InProgress) a.push(ev);
      else if (bucket === ShortcutEventBucket.Upcoming) b.push(ev);
      else if (bucket === ShortcutEventBucket.Completed) c.push(ev);
    }
    return { inProgress: a, upcoming: b, completed: c };
  }, [eventsQuery.data, now, tz]);

  const aggregates = useMemo(() => {
    const total = (eventsQuery.data ?? []).length;
    const nextStarts = upcoming
      .map((ev) => eventInstantInTimezone(ev.date, ev.time_from, tz))
      .filter((t): t is Date => t != null)
      .sort((a, b) => a.getTime() - b.getTime());
    return { total, nextStart: nextStarts[0] };
  }, [eventsQuery.data, upcoming, tz]);

  const isTenantToday = getTenantRelativeDay(ymdForQuery, tz) === "today";

  const loadingScopeCourses = !seesAllCourses && coursesQuery.isLoading;
  const loadingEvents = eventsEnabled && eventsQuery.isLoading;
  const showContentSkeleton = loadingScopeCourses || loadingEvents;

  const selectedDateForPicker = useMemo(
    () => parse(ymdForQuery, "yyyy-MM-dd", new Date()),
    [ymdForQuery],
  );

  const pageTitle = pageTitleForDay(ymdForQuery, tz);

  usePageHeader(
    useMemo(
      () =>
        user && canAccessStaffShortcuts(user)
          ? {
              breadcrumb: (
                <h1 className="font-serif text-lg text-text-primary">
                  {pageTitle}
                </h1>
              ),
              toolbar: (
                <FilterToolbar
                  className="grid w-full max-w-md grid-cols-[auto_minmax(0,1fr)_auto] items-center sm:w-auto sm:max-w-none"
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="size-9 shrink-0 p-0"
                    aria-label="Previous day"
                    onClick={() =>
                      setSelectedYmd(
                        addCalendarDaysToTenantYmd(ymdForQuery, tz, -1),
                      )
                    }
                  >
                    <NavArrowLeft className="size-4" />
                  </Button>
                  <DatePicker
                    date={selectedDateForPicker}
                    setDate={(d) => {
                      if (d) setSelectedYmd(format(d, "yyyy-MM-dd"));
                    }}
                    size="compact"
                    className="w-full min-w-[8rem]"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="size-9 shrink-0 p-0"
                    aria-label="Next day"
                    onClick={() =>
                      setSelectedYmd(
                        addCalendarDaysToTenantYmd(ymdForQuery, tz, 1),
                      )
                    }
                  >
                    <NavArrowRight className="size-4" />
                  </Button>
                </FilterToolbar>
              ),
            }
          : null,
      [user, pageTitle, ymdForQuery, tz, selectedDateForPicker],
    ),
  );

  if (userLoading || (user && !canAccessStaffShortcuts(user))) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <PageContainer width="default" className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/shortcuts"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Shortcuts
        </Link>
        <p className="max-w-2xl text-sm text-text-muted">
          Sessions scheduled for {ymdForQuery} ({tz}). Overlapping times are grouped
          in one row; use &quot;+N more&quot; when there are many at the same start
          time.
        </p>
      </header>

      {showContentSkeleton ? (
        <div className="space-y-4" aria-busy="true">
          <StatCardsSkeleton count={4} className="lg:grid-cols-4" />
          <div className="space-y-4">
            {[1, 2, 3].map((section) => (
              <section key={section} className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <ListRowsSkeleton rows={2} />
              </section>
            ))}
          </div>
        </div>
      ) : eventsQuery.isError ? (
        <p className="text-danger text-sm" role="alert">
          Failed to load sessions for this day. Please try again.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-text-muted">
                {isTenantToday ? "Total today" : "Sessions this day"}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {aggregates.total}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-text-muted">In progress</div>
              <div className="text-2xl font-semibold tabular-nums">
                {inProgress.length}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-text-muted">Upcoming</div>
              <div className="text-2xl font-semibold tabular-nums">
                {upcoming.length}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-text-muted">Completed</div>
              <div className="text-2xl font-semibold tabular-nums">
                {completed.length}
              </div>
            </div>
          </div>
          {aggregates.nextStart && upcoming.length > 0 && (
            <p className="text-sm text-text-muted">
              Next start:{" "}
              <span className="font-medium text-text-primary">
                {format(aggregates.nextStart, orgTimeDateFnsPattern(timeFormat))}
              </span>
            </p>
          )}

          <div className="space-y-8">
            <ShortcutSessionSection
              title="In progress"
              events={inProgress}
              emptyHint="No sessions are running right now."
            />
            <ShortcutSessionSection
              title="Upcoming"
              events={upcoming}
              emptyHint={
                isTenantToday
                  ? "No more sessions scheduled for later today."
                  : "No more sessions scheduled later that day."
              }
            />
            <ShortcutSessionSection
              title="Completed"
              events={completed}
              emptyHint={
                isTenantToday
                  ? "No past sessions today yet."
                  : "No past sessions on that day yet."
              }
            />
          </div>
        </>
      )}
    </PageContainer>
);
};

export default TodaysClassesPage;
