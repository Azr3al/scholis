"use client";

import { PageContainer } from "@/components/layout/page-container";
import { axiosClient } from "@/lib/api";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { Skeleton } from "@/components/primitives";
import { StatCardsSkeleton, TableSkeleton } from "@/components/loading/structured-skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/courses/ui/table";
import { PrimaryTeacherLine } from "@/components/course/primary-teacher-line";
import { isStudent } from "@/helpers/authorization";
import { utcDateTimeToTenantHHmm } from "@/helpers/checkin-history";
import { formatDate } from "@/helpers/date";
import { tenantShowsMeetingAttendance } from "@/helpers/meeting-attendance-gate";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { parseAsInteger, useQueryState } from "nuqs";
import { Suspense, useMemo } from "react";
import {
  formatOrgTime,
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";

type DashboardInterval = {
  id: number;
  user_id: number;
  user_name: string;
  join_datetime: string;
  leave_datetime: string;
  duration_seconds: number;
  lateness_label: string | null;
  minutes_delta: number | null;
};

type PerUserDayTotal = {
  user_id: number;
  user_name: string;
  total_duration_seconds: number;
  interval_count: number;
};

type DashboardDay = {
  date: string;
  has_scheduled_event: boolean;
  has_any_attendance: boolean;
  scheduled_but_not_synced: boolean;
  intervals: DashboardInterval[];
  per_user_day_totals: PerUserDayTotal[];
};

type TeacherSummary = {
  user_id: number;
  user_name: string;
  user_email: string;
  assigned_as_role_name?: string;
  sessions_attended: number;
  sessions_scheduled: number;
  pct: number;
  total_duration_seconds: number;
};

type MeetingAttendanceDashboard = {
  course: {
    id: number;
    title: string;
    time_from: string | null;
    time_to: string | null;
    start_date: string | null;
    end_date: string | null;
    events_total: number;
    events_in_month: number;
  };
  teachers: TeacherSummary[];
  days: DashboardDay[];
};

const teacherNameLinkClass =
  "text-text-primary underline-offset-4 hover:underline";

function formatDurationSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${r}s`;
}

function formatMeetingClock(
  iso: string | undefined,
  tenantTimezone: string | undefined,
  timeFormat: TimeDisplayFormatValue,
): string {
  if (!iso) return "—";
  const hhmm = iso.includes("T")
    ? utcDateTimeToTenantHHmm(iso, tenantTimezone)
    : iso;
  return hhmm ? formatOrgTime(hhmm, timeFormat) : "—";
}

function MeetingAttendanceContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  const defaultY = new Date().getFullYear();
  const defaultM = new Date().getMonth() + 1;
  const [yearQs, setYearQs] = useQueryState(
    "year",
    parseAsInteger.withDefault(defaultY),
  );
  const [monthQs, setMonthQs] = useQueryState(
    "month",
    parseAsInteger.withDefault(defaultM),
  );

  const anchorDate = useMemo(
    () => new Date(yearQs, monthQs - 1, 1),
    [yearQs, monthQs],
  );
  const setAnchorDate = (d: Date) => {
    void setYearQs(d.getFullYear());
    void setMonthQs(d.getMonth() + 1);
  };

  const gateOk = tenantShowsMeetingAttendance(tenant ?? null);
  const staffOk = user && !isStudent(user);

  const dashboardQuery = useQuery({
    queryKey: ["meeting-attendance-dashboard", id, yearQs, monthQs],
    enabled: Boolean(id && staffOk && gateOk),
    queryFn: async () => {
      const res = await axiosClient.get<{
        isError?: boolean;
        data: MeetingAttendanceDashboard;
      }>(`courses/${id}/meeting-attendance-dashboard`, {
        params: { year: yearQs, month: monthQs },
      });
      return res.data.data;
    },
  });

  if (!user) {
    return (
      <p className="text-text-muted text-sm py-8 text-center">
        Sign in to view this page.
      </p>
    );
  }

  if (isStudent(user)) {
    return (
      <p className="text-text-muted text-sm py-8 text-center">
        This page is only available to staff.
      </p>
    );
  }

  if (!gateOk) {
    return (
      <p className="text-text-muted text-sm py-8 text-center">
        Meeting attendance is not available for your school.
      </p>
    );
  }

  const dash = dashboardQuery.data;
  const c = dash?.course;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <Link
        href={`/courses/${id}`}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Back to course
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Meeting attendance
          </h1>
          {c ? (
            <div className="mt-2 space-y-1 text-sm text-text-muted">
              <p className="font-medium text-text-primary">{c.title}</p>
              <p>
                Schedule: {formatOrgTime(c.time_from, timeFormat)} – {formatOrgTime(c.time_to, timeFormat)}{" "}
                (
                {c.start_date ? formatDate(new Date(c.start_date)) : "—"} –{" "}
                {c.end_date ? formatDate(new Date(c.end_date)) : "—"})
              </p>
              <p>
                Total class sessions (course): {c.events_total}
                {c.events_in_month != null ? (
                  <>
                    {" "}
                    · Scheduled this month: {c.events_in_month}
                  </>
                ) : null}
              </p>
            </div>
          ) : dashboardQuery.isLoading ? (
            <Skeleton className="mt-2 h-20 w-full max-w-md" aria-busy="true" />
          ) : null}
        </div>
        <div className="shrink-0 sm:pt-1">
          <YearMonthSelector
            label="Month"
            date={anchorDate}
            setDate={setAnchorDate}
          />
        </div>
      </div>

      {dashboardQuery.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <StatCardsSkeleton count={3} />
          <div className="space-y-3">
            <Skeleton className="h-6 w-36" />
            <TableSkeleton columns={5} rows={6} />
          </div>
        </div>
      ) : dashboardQuery.isError ? (
        <p className="text-danger text-sm" role="alert">
          Failed to load attendance. Please try again.
        </p>
      ) : dash ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dash.teachers.map((t) => {
              const roleName =
                t.assigned_as_role_name &&
                String(t.assigned_as_role_name).trim()
                  ? t.assigned_as_role_name.trim()
                  : "";
              return (
                <div key={t.user_id} className="space-y-2 border-b border-border pb-4">
                  <div className="min-w-0 space-y-1 pb-2">
                    <h3 className="text-base font-normal text-text-primary">
                      <PrimaryTeacherLine
                        teacher={{
                          id: t.user_id,
                          name: t.user_name,
                          email: t.user_email,
                        }}
                        profileUserId={t.user_id}
                        className="text-sm font-medium"
                      />
                    </h3>
                    <div className="space-y-1 text-sm text-text-secondary">
                      {roleName ? (
                        <span className="block">{roleName}</span>
                      ) : null}
                      <span className="block">
                        This month: {t.sessions_attended} /{" "}
                        {t.sessions_scheduled} class days ({t.pct}%)
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-text-muted">
                    Total time this month:{" "}
                    {formatDurationSeconds(t.total_duration_seconds)}
                  </div>
                </div>
              );
            })}
          </div>

          {dash.teachers.length === 0 &&
          dash.days.every((d) => d.intervals.length === 0) ? (
            <p className="text-text-muted text-sm py-8 text-center">
              No main or assistant teachers on the roster for summary cards, and no
              attendance for this month yet.
            </p>
          ) : dash.teachers.length === 0 ? (
            <p className="text-text-muted text-sm">
              Summary cards only include main and assistant teachers (excluding Other
              seniority). Everyone who joined still appears in the day list below.
            </p>
          ) : null}

          <div className="flex flex-col gap-8">
            {dash.days.map((day) => (
              <section key={day.date} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 border-b pb-2">
                  <h2 className="text-lg font-medium">
                    {formatDate(new Date(day.date + "T12:00:00"))}
                  </h2>
                  {day.scheduled_but_not_synced ? (
                    <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-normal text-text-secondary">
                      Class was scheduled — no meeting attendance recorded yet
                    </span>
                  ) : null}
                </div>

                {day.intervals.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Teacher</TableHead>
                        <TableHead>Join</TableHead>
                        <TableHead>Leave</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead
                          className="whitespace-normal"
                          title="Compared to scheduled class start — shown only for each teacher’s first join that day."
                        >
                          Vs class start
                          <span className="mt-0.5 block text-xs font-normal text-text-muted normal-case">
                            (first join that day)
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {day.intervals.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Link
                              href={`/users/${row.user_id}`}
                              className={teacherNameLinkClass}
                            >
                              {row.user_name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {formatMeetingClock(
                              row.join_datetime,
                              tenant?.timezone,
                              timeFormat,
                            )}
                          </TableCell>
                          <TableCell>
                            {formatMeetingClock(
                              row.leave_datetime,
                              tenant?.timezone,
                              timeFormat,
                            )}
                          </TableCell>
                          <TableCell>
                            {formatDurationSeconds(row.duration_seconds)}
                          </TableCell>
                          <TableCell>
                            {row.lateness_label ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : !day.scheduled_but_not_synced ? (
                  <p className="text-text-muted text-sm">
                    No meeting intervals for this day.
                  </p>
                ) : null}

                {day.per_user_day_totals.length > 0 ? (
                  <div className="flex flex-col gap-2 rounded-lg border bg-surface-hover p-3 text-sm">
                    <p className="font-medium text-text-primary">
                      Totals for this day
                    </p>
                    <ul className="space-y-1">
                      {day.per_user_day_totals.map((u) => (
                        <li
                          key={u.user_id}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <Link
                            href={`/users/${u.user_id}`}
                            className={teacherNameLinkClass}
                          >
                            {u.user_name}
                          </Link>
                          <span className="text-text-muted">
                            {formatDurationSeconds(u.total_duration_seconds)}
                          </span>
                          {u.interval_count > 1 ? (
                            <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-normal text-text-secondary">
                              {u.interval_count} joins
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function CourseMeetingAttendancePage() {
  return  (
<PageContainer width="wide">
<Suspense
      fallback={
        <div className="mx-auto mt-8 max-w-5xl space-y-4" aria-busy="true">
          <StatCardsSkeleton count={3} />
          <TableSkeleton columns={5} rows={5} />
        </div>
      }
    >
      <MeetingAttendanceContent />
    </Suspense>
</PageContainer>
);
}
