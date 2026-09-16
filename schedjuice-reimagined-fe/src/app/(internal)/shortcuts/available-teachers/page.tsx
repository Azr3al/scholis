"use client";

import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { usePageHeader } from "@/components/shell/use-page-header";
import { fetchAvailableTeachersForTimeslot } from "@/app/client-api/utils";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import {
  FilterToolbar,
  FilterToolbarField,
} from "@/components/filters/filter-toolbar";
import { Pagination } from "@/components/data-table/parts/pagination";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/reports/report-table";
import {
  canAccessStaffShortcuts,
  hasSchoolWideCourseAccess,
} from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { crossfadeInstant, crossfadeOpacity } from "@/lib/sj/motion";
import { dashboardSectionStackClassName } from "@/lib/ui-remediation/r7-dashboard-layout-classes";
import { unwrapList } from "@/sdk/core/envelope";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Checkbox, Select, Skeleton } from "@/components/primitives";

const HALF_HOUR_TIMES: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      );
    }
  }
  return out;
})();

const timeItems = HALF_HOUR_TIMES.map((t) => ({ label: t, value: t }));

/** ISO weekdays: Monday = 1 … Sunday = 7 (matches backend). */
const ISO_WEEKDAY_LABELS: { iso: number; label: string }[] = [
  { iso: 1, label: "Mon" },
  { iso: 2, label: "Tue" },
  { iso: 3, label: "Wed" },
  { iso: 4, label: "Thu" },
  { iso: 5, label: "Fri" },
  { iso: 6, label: "Sat" },
  { iso: 7, label: "Sun" },
];

const TABLE_HEAD_CLASS =
  "h-11 px-4 text-xs font-medium uppercase tracking-wide text-text-secondary";

const TABLE_CELL_CLASS = "px-4 py-3.5 align-middle";

const PAGE_SIZE = 25;

type DayParity = "all" | "even" | "odd";

const DAY_PARITY_ITEMS: { label: string; value: DayParity }[] = [
  { label: "All dates", value: "all" },
  { label: "Odd dates (1, 3, 5…)", value: "odd" },
  { label: "Even dates (2, 4, 6…)", value: "even" },
];

type AvailableTeachersQueryResult = {
  rows: AvailableTeacherRow[];
  total: number;
  totalPages: number;
};

function parseWeekdaySet(weekdaysParam: string): Set<number> {
  const s = new Set<number>();
  for (const part of weekdaysParam.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const n = Number(t);
    if (n >= 1 && n <= 7) s.add(n);
  }
  return s;
}

function formatWeekdayParam(selected: Set<number>): string {
  return Array.from(selected)
    .sort((a, b) => a - b)
    .join(",");
}

type AvailableTeacherRow = { id: number; name: string; email: string };

type ResultsPhase = "idle" | "loading" | "error" | "empty" | "ready";

const AvailableTeachersPage = () => {
  const { user, isLoading: userLoading } = useUser();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const crossfadeVariants = reducedMotion ? crossfadeInstant : crossfadeOpacity;

  const [yearMonth, setYearMonth] = useQueryState(
    "year_month",
    parseAsString.withDefault(format(new Date(), "yyyy-MM")),
  );
  const [timeFrom, setTimeFrom] = useQueryState(
    "time_from",
    parseAsString.withDefault("18:00"),
  );
  const [timeTo, setTimeTo] = useQueryState(
    "time_to",
    parseAsString.withDefault("19:30"),
  );
  const [weekdays, setWeekdays] = useQueryState(
    "weekdays",
    parseAsString.withDefault(""),
  );
  const [dayParity, setDayParity] = useQueryState(
    "day_parity",
    parseAsString.withDefault("all"),
  );
  const [page, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1),
  );

  const monthDate = useMemo(() => {
    try {
      return parse(`${yearMonth}-01`, "yyyy-MM-dd", new Date());
    } catch {
      return new Date();
    }
  }, [yearMonth]);

  const weekdaySet = useMemo(() => parseWeekdaySet(weekdays ?? ""), [weekdays]);

  const dayParityValue: DayParity =
    dayParity === "even" || dayParity === "odd" ? dayParity : "all";

  const toggleWeekday = useCallback(
    (iso: number, checked: boolean) => {
      const next = new Set(weekdaySet);
      if (checked) next.add(iso);
      else next.delete(iso);
      const param = formatWeekdayParam(next);
      void setWeekdays(param.length ? param : null);
    },
    [weekdaySet, setWeekdays],
  );

  const paramsReady = useMemo(() => {
    if (weekdaySet.size === 0) return false;
    if (!timeFrom || !timeTo || !yearMonth) return false;
    if (timeTo <= timeFrom) return false;
    return true;
  }, [weekdaySet.size, timeFrom, timeTo, yearMonth]);

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

  const filterResetRef = useRef(true);

  useEffect(() => {
    if (filterResetRef.current) {
      filterResetRef.current = false;
      return;
    }
    void setPage(1);
  }, [yearMonth, timeFrom, timeTo, weekdays, dayParity, setPage]);

  const query = useQuery({
    queryKey: [
      "available-teachers",
      yearMonth,
      timeFrom,
      timeTo,
      weekdays,
      dayParityValue,
      page,
      PAGE_SIZE,
    ],
    queryFn: async (): Promise<AvailableTeachersQueryResult> => {
      const res = await fetchAvailableTeachersForTimeslot({
        yearMonth: yearMonth ?? "",
        timeFrom: timeFrom ?? "",
        timeTo: timeTo ?? "",
        weekdays: weekdays ?? "",
        dayParity: dayParityValue,
        page,
        size: PAGE_SIZE,
      });
      const body = res.data as {
        isError?: boolean;
        message?: string;
        data?: AvailableTeacherRow[];
        count?: number;
        total_pages?: number;
      };
      if (body.isError) {
        throw new Error(body.message || "Request failed");
      }
      const { rows, total } = unwrapList(body, { pageSize: PAGE_SIZE });
      const totalPages =
        typeof body.total_pages === "number"
          ? body.total_pages
          : Math.max(1, Math.ceil(total / PAGE_SIZE));
      return { rows, total, totalPages };
    },
    enabled:
      !!paramsReady &&
      !userLoading &&
      !!user &&
      hasSchoolWideCourseAccess(user),
  });

  const resultsPhase: ResultsPhase = useMemo(() => {
    if (!paramsReady) return "idle";
    if (query.isLoading) return "loading";
    if (query.isError) return "error";
    if ((query.data?.total ?? 0) === 0) return "empty";
    return "ready";
  }, [paramsReady, query.isLoading, query.isError, query.data?.total]);

  const motionKey =
    resultsPhase === "ready"
      ? `ready-${page}`
      : resultsPhase;

  const headerToolbar = useMemo(
    () => (
      <FilterToolbar>
        <YearMonthSelector
          layout="toolbar"
          label="Month"
          date={monthDate}
          setDate={(d) => {
            void setYearMonth(format(d, "yyyy-MM"));
          }}
        />
        <FilterToolbarField label="From" width="sm">
          <Select
            size="compact"
            className="w-auto min-w-32"
            items={timeItems}
            value={timeFrom ?? "18:00"}
            onValueChange={(v) => {
              if (v != null) void setTimeFrom(String(v));
            }}
          />
        </FilterToolbarField>
        <FilterToolbarField label="To" width="sm">
          <Select
            size="compact"
            className="w-auto min-w-32"
            items={timeItems}
            value={timeTo ?? "19:30"}
            onValueChange={(v) => {
              if (v != null) void setTimeTo(String(v));
            }}
          />
        </FilterToolbarField>
      </FilterToolbar>
    ),
    [monthDate, setYearMonth, timeFrom, setTimeFrom, timeTo, setTimeTo],
  );

  usePageHeader(
    useMemo(
      () =>
        user && canAccessStaffShortcuts(user) && hasSchoolWideCourseAccess(user)
          ? {
              breadcrumb: (
                <h1 className="font-serif text-lg text-text-primary">
                  Available teachers
                </h1>
              ),
              toolbar: headerToolbar,
            }
          : null,
      [user, headerToolbar],
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
    <PageContainer
      width="wide"
      className={dashboardSectionStackClassName()}
    >
      <header className="space-y-3" data-slot="page-quiet">
        <Link
          href="/shortcuts"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Shortcuts
        </Link>
        <p className="max-w-2xl text-sm text-text-muted">
          Pick days of the week, a month, and a time range. Optionally narrow to
          odd or even calendar dates in that month. We list teachers who are free
          at that time on every matching day you chose. Times follow your
          school&apos;s usual time zone, in 30-minute steps.
        </p>
      </header>

      <section className="space-y-3" data-slot="page-supporting">
        <FilterToolbarField label="Weekdays" width="auto">
          <div className="flex flex-wrap gap-4 pt-0.5">
            {ISO_WEEKDAY_LABELS.map(({ iso, label }) => (
              <label
                key={iso}
                className="flex items-center gap-2 text-sm font-medium leading-none"
              >
                <Checkbox
                  checked={weekdaySet.has(iso)}
                  onCheckedChange={(c) => toggleWeekday(iso, c === true)}
                />
                {label}
              </label>
            ))}
          </div>
        </FilterToolbarField>

        <FilterToolbarField label="Dates in the month" width="sm">
          <Select
            size="compact"
            className="w-auto min-w-48"
            items={DAY_PARITY_ITEMS}
            value={dayParityValue}
            onValueChange={(v) => {
              if (v != null) void setDayParity(String(v));
            }}
          />
        </FilterToolbarField>

        {!paramsReady ? (
          <p className="text-sm text-text-muted">
            Select at least one weekday and ensure &quot;To&quot; is after
            &quot;From&quot; to load results.
          </p>
        ) : null}
      </section>

      <PageSection dominant className="min-h-80">
        {!paramsReady ? (
          <p className="text-sm text-text-muted" aria-hidden="true">
            &nbsp;
          </p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={motionKey}
              variants={crossfadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              aria-busy={resultsPhase === "loading"}
            >
              {resultsPhase === "loading" ? (
                <TableSkeleton columns={3} rows={6} />
              ) : resultsPhase === "error" ? (
                <p className="text-sm text-danger" role="alert">
                  Failed to load. Please try again.
                </p>
              ) : resultsPhase === "empty" ? (
                <EmptyState>
                  <EmptyCopy
                    enBefore="No teachers "
                    enHighlight="available"
                    enAfter=" for this slot"
                    myBefore="No teachers "
                    myHighlight="available"
                    myAfter=" for this slot"
                  />
                  <p className="text-sm text-text-muted">
                    Everyone is busy on at least one matching day, or filters
                    exclude them.
                  </p>
                </EmptyState>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border-subtle hover:bg-transparent">
                        <TableHead className={TABLE_HEAD_CLASS}>Name</TableHead>
                        <TableHead className={TABLE_HEAD_CLASS}>Email</TableHead>
                        <TableHead
                          className={cn(TABLE_HEAD_CLASS, "w-30")}
                        >
                          {" "}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {query.data?.rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="min-h-13 border-border-subtle"
                        >
                          <TableCell
                            className={cn(TABLE_CELL_CLASS, "font-medium")}
                          >
                            {row.name}
                          </TableCell>
                          <TableCell className={TABLE_CELL_CLASS}>
                            {row.email}
                          </TableCell>
                          <TableCell className={TABLE_CELL_CLASS}>
                            <Link
                              href={`/users/${row.id}`}
                              className="text-sm text-accent underline-offset-4 hover:underline"
                            >
                              Profile
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    className="px-4"
                    page={page}
                    pageSize={PAGE_SIZE}
                    totalCount={query.data?.total ?? 0}
                    onPageChange={(nextPage) => void setPage(nextPage)}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </PageSection>
    </PageContainer>
  );
};

export default AvailableTeachersPage;
