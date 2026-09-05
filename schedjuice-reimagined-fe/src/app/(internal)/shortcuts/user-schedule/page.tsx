"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { fetchEntity, searchEntities } from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import {
  ShortcutSessionSection,
  type ShortcutSessionEventRow,
} from "@/components/shortcuts/shortcut-session-section";
import { ListRowsSkeleton, StatCardsSkeleton } from "@/components/loading/structured-skeletons";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/date/date-picker";
import {
  canAccessStaffShortcuts,
  hasSchoolWideCourseAccess,
} from "@/helpers/authorization";
import { listToApiArray } from "@/helpers/filter-params";
import {
  classifyEvent,
  ShortcutEventBucket,
} from "@/helpers/shortcuts-event-buckets";
import {
  eventInstantInTimezone,
  getTenantDayBoundariesIso,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import { format, parse } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { Button, buttonVariants, Skeleton } from "@/components/primitives";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";

type EventRow = ShortcutSessionEventRow;

/**
 * Schedule rows come from user-events (UserEvent). Coverage matches attendance
 * tooling; if some student sessions are missing, consider merging events from
 * course enrollment in a follow-up.
 */
function mapUserEventsToRows(data: unknown[]): EventRow[] {
  const out: EventRow[] = [];
  for (const raw of data) {
    const ue = raw as { event?: EventRow };
    const ev = ue?.event;
    if (!ev || typeof ev.id !== "number") continue;
    out.push({
      id: ev.id,
      title: ev.title,
      date: ev.date,
      time_from: ev.time_from,
      time_to: ev.time_to,
      course: ev.course ?? 0,
    });
  }
  return out;
}

const UserSchedulePage = () => {
  const { user, isLoading: userLoading } = useUser();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const router = useRouter();
  const tz = tenant?.timezone ?? "UTC";
  const todayYmd = useMemo(() => getTenantTodayYmd(tz), [tz]);

  const [userId, setUserId] = useQueryState(
    "userId",
    parseAsString.withDefault(""),
  );
  const [fromQ, setFromQ] = useQueryState(
    "from",
    parseAsString.withDefault(""),
  );
  const [toQ, setToQ] = useQueryState("to", parseAsString.withDefault(""));

  const fromYmd = fromQ || todayYmd;
  const toYmd = toQ || todayYmd;
  const rangeStartYmd = fromYmd <= toYmd ? fromYmd : toYmd;
  const rangeEndYmd = fromYmd <= toYmd ? toYmd : fromYmd;

  const { startIso, endIso } = useMemo(() => {
    const start = getTenantDayBoundariesIso(tz, rangeStartYmd).startIso;
    const end = getTenantDayBoundariesIso(tz, rangeEndYmd).endIso;
    return { startIso: start, endIso: end };
  }, [tz, rangeStartYmd, rangeEndYmd]);

  useEffect(() => {
    if (!userLoading && user && !canAccessStaffShortcuts(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!userLoading && user && !hasSchoolWideCourseAccess(user)) {
      router.replace("/shortcuts");
    }
  }, [userLoading, user, router]);

  const selectedUserQuery = useQuery({
    queryKey: ["user-schedule-selected-user", userId],
    queryFn: () => fetchEntity("users", userId, ["id", "name", "email"]),
    enabled: !!userId,
  });

  const selectedUser = selectedUserQuery.data?.data?.data as
    | { id: number; name: string; email?: string }
    | undefined;

  const comboboxLabel = selectedUser?.name
    ? selectedUser.name
    : "Search user by name or email";

  const fetchUserOptions = useCallback(
    async (searchValue: string) => {
      const q = searchValue.trim();
      if (q.length < 2) return [];
      const res = await searchEntities(
        "users",
        {
          size: 20,
          fields: ["id", "name", "email", "alternative_name"],
          sorts: ["name"],
          q,
        },
        {
          filter_params: [
            {
              field_name: "roles",
              operator: operatorEnum.contained_by,
              value: listToApiArray([
                role.superadmin,
                role.admin,
                role.manager,
                role.teacher,
                role.finance,
                role.hr,
              ]),
            },
          ],
        },
      );
      const rows = (res.data?.data ?? []) as {
        id: number;
        name: string;
        email?: string;
        alternative_name?: string | null;
      }[];
      return rows.map((u) => ({
        value: String(u.id),
        label: [u.name, u.email].filter(Boolean).join(" · "),
      }));
    },
    [],
  );

  const scheduleQuery = useQuery({
    queryKey: [
      "user-schedule-user-events",
      userId,
      startIso,
      endIso,
    ],
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
              value: String(userId),
            },
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
      return mapUserEventsToRows((res.data?.data ?? []) as unknown[]);
    },
    enabled: !!userId,
  });

  const now = useMemo(() => new Date(), []);

  const { inProgress, upcoming, completed } = useMemo(() => {
    const rows = scheduleQuery.data ?? [];
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
  }, [scheduleQuery.data, now, tz]);

  const aggregates = useMemo(() => {
    const total = (scheduleQuery.data ?? []).length;
    const nextStarts = upcoming
      .map((ev) => eventInstantInTimezone(ev.date, ev.time_from, tz))
      .filter((t): t is Date => t != null)
      .sort((a, b) => a.getTime() - b.getTime());
    return { total, nextStart: nextStarts[0] };
  }, [scheduleQuery.data, upcoming, tz]);

  const fromDate = useMemo(
    () => parse(rangeStartYmd, "yyyy-MM-dd", new Date()),
    [rangeStartYmd],
  );
  const toDate = useMemo(
    () => parse(rangeEndYmd, "yyyy-MM-dd", new Date()),
    [rangeEndYmd],
  );

  const rangeMismatch = fromYmd !== toYmd && fromYmd > toYmd;


  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">User schedule lookup</h1>
        ),
      }),
      [],
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

  const loadingSchedule = !!userId && scheduleQuery.isLoading;
  const showSkeleton = loadingSchedule;

  return  (
<PageContainer width="default" className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/shortcuts"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Shortcuts
        </Link>
        <p className="text-text-muted text-sm max-w-2xl">
          Search for someone by name, email, or other name, then see their class
          sessions in the dates you pick. If you don&apos;t change the dates, we
          use today in your school&apos;s time zone.
        </p>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="min-w-[min(100%,280px)] max-w-md flex-1">
          <EntityCombobox
            label={comboboxLabel}
            value={userId || undefined}
            onChange={(v) => setUserId(v || null)}
            fetchOptions={fetchUserOptions}
            debounceMilliseconds={300}
            widthClassName="w-full max-w-md"
          />
        </div>
        {selectedUser && (
          <Link
            href={`/users/${selectedUser.id}`}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm"  }),
              "w-fit"
            )}
          >
            Open user profile
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <p className="text-sm text-text-muted">From</p>
          <div className="w-[min(100%,220px)] min-w-[180px]">
            <DatePicker
              date={fromDate}
              setDate={(d) => {
                if (d) setFromQ(format(d, "yyyy-MM-dd"));
              }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm text-text-muted">To</p>
          <div className="w-[min(100%,220px)] min-w-[180px]">
            <DatePicker
              date={toDate}
              setDate={(d) => {
                if (d) setToQ(format(d, "yyyy-MM-dd"));
              }}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => {
            setFromQ(todayYmd);
            setToQ(todayYmd);
          }}
        >
          Today
        </Button>
      </div>

      {rangeMismatch && (
        <p className="text-sm text-text-muted">
          Start and end were swapped so the range runs from {rangeStartYmd} to{" "}
          {rangeEndYmd}.
        </p>
      )}

      {!userId ? (
        <p className="text-text-muted text-sm border rounded-xl p-6">
          Select a user to load their schedule.
        </p>
      ) : showSkeleton ? (
        <div className="space-y-4" aria-busy="true">
          <StatCardsSkeleton count={4} className="lg:grid-cols-4" />
          {[1, 2, 3].map((section) => (
            <section key={section} className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <ListRowsSkeleton rows={2} />
            </section>
          ))}
        </div>
      ) : scheduleQuery.isError ? (
        <p className="text-danger text-sm" role="alert">
          Failed to load sessions. Please try again.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-text-muted">Total in range</div>
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
              emptyHint="No sessions are running right now in this range."
            />
            <ShortcutSessionSection
              title="Upcoming"
              events={upcoming}
              emptyHint="No upcoming sessions in this range."
            />
            <ShortcutSessionSection
              title="Completed"
              events={completed}
              emptyHint="No completed sessions in this range."
            />
          </div>
        </>
      )}
    </PageContainer>
);
};

export default UserSchedulePage;
