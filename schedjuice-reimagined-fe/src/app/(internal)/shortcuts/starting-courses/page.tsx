"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { searchEntities } from "@/app/client-api/utils";
import { DateRangeFilter } from "@/components/form/date-range-filter";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { CardGridSkeleton } from "@/components/loading/structured-skeletons";
import { StartingCourseCard } from "@/components/shortcuts/starting-course-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/reports/report-card";
import { Select } from "@/components/primitives";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/charts/chart";
import {
  canAccessStaffShortcuts,
  canAccessStartingCoursesShortcut,
} from "@/helpers/authorization";
import {
  COURSE_START_TIMING_LABEL_EARLY,
  COURSE_START_TIMING_LABEL_LATER,
  getCourseMonthType,
  getDateISOString,
  getFirstDayOfMonth,
  getIsoWeekRangeBounds,
  getIsoWeeksOverlappingMonth,
  getLastDayOfMonth,
} from "@/helpers/date";
import {
  resolveDateRange,
  type DateRangePreset,
} from "@/helpers/date-range-presets";
import {
  getCategoryDisplayName,
  getCategorySortOrderFromCourse,
} from "@/helpers/category-grouping";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import type { courseType } from "@/types/course";
import {
  parseCourseMonthFilter,
  UnpaidShortcutCourseMonthFilter,
} from "@/types/unpaid-course-shortcut";
import { useQuery } from "@tanstack/react-query";
import {
  addWeeks,
  eachMonthOfInterval,
  format,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { NavArrowLeft, Search } from "iconoir-react";
import Link from "next/link";
import {
  parseAsBoolean,
  parseAsIsoDateTime,
  parseAsString,
  useQueryState,
} from "nuqs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Button, Input, Skeleton } from "@/components/primitives";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from "recharts";

const STARTING_CHART_PRESETS = [
  "week",
  "month",
  "last3m",
  "custom",
] as const satisfies readonly DateRangePreset[];

function isStartingChartPreset(s: string | null): s is DateRangePreset {
  return (
    s != null && (STARTING_CHART_PRESETS as readonly string[]).includes(s)
  );
}

const CHART_INTERVAL = {
  week: "week",
  month: "month",
} as const;

type ChartInterval = (typeof CHART_INTERVAL)[keyof typeof CHART_INTERVAL];

const chartTrendConfig = {
  coursesCount: {
    label: "Classes starting",
    theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
  },
  studentsTotal: {
    label: "Students (total)",
    theme: { light: "var(--chart-2)", dark: "var(--chart-2)" },
  },
} satisfies ChartConfig;

function weekBucketKeys(chartStart: string, chartEnd: string): string[] {
  const start = parse(chartStart, "yyyy-MM-dd", new Date());
  const end = parse(chartEnd, "yyyy-MM-dd", new Date());
  let m = startOfWeek(start, { weekStartsOn: 1 });
  const keys: string[] = [];
  for (let i = 0; i < 200 && m <= end; i++) {
    keys.push(getDateISOString(m));
    m = addWeeks(m, 1);
  }
  return keys;
}

function monthBucketKeys(chartStart: string, chartEnd: string): string[] {
  const start = parse(chartStart, "yyyy-MM-dd", new Date());
  const end = parse(chartEnd, "yyyy-MM-dd", new Date());
  return eachMonthOfInterval({
    start: startOfMonth(start),
    end: startOfMonth(end),
  }).map((d) => format(d, "yyyy-MM"));
}

export default function StartingCoursesPage() {
  const { user, isLoading: userLoading } = useUser();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const router = useRouter();

  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );
  const [courseMonthRaw, setCourseMonthRaw] = useQueryState(
    "courseMonth",
    parseAsString.withDefault(UnpaidShortcutCourseMonthFilter.All),
  );
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [listThisWeek, setListThisWeek] = useQueryState(
    "thisWeek",
    parseAsBoolean.withDefault(false),
  );
  const [listWeekStartRaw, setListWeekStart] = useQueryState(
    "weekStart",
    parseAsString,
  );

  const [chartPresetRaw, setChartPreset] = useQueryState(
    "chartPreset",
    parseAsString.withDefault("last3m"),
  );
  const chartPreset: DateRangePreset = isStartingChartPreset(chartPresetRaw)
    ? chartPresetRaw
    : "last3m";
  const [chartFrom, setChartFrom] = useQueryState("chartFrom", parseAsString);
  const [chartTo, setChartTo] = useQueryState("chartTo", parseAsString);
  const [chartIntervalRaw, setChartInterval] = useQueryState(
    "chartInterval",
    parseAsString.withDefault(CHART_INTERVAL.week),
  );
  const chartInterval: ChartInterval =
    chartIntervalRaw === CHART_INTERVAL.month
      ? CHART_INTERVAL.month
      : CHART_INTERVAL.week;

  const courseMonthFilter = parseCourseMonthFilter(courseMonthRaw);
  const fmHmFilterEnabled = !!tenant?.is_fm_hm_course_display_enabled;
  const allowed = user ? canAccessStartingCoursesShortcut(user) : false;

  useEffect(() => {
    if (!userLoading && user && !canAccessStaffShortcuts(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (
      !userLoading &&
      user &&
      canAccessStaffShortcuts(user) &&
      !canAccessStartingCoursesShortcut(user)
    ) {
      router.replace("/shortcuts");
    }
  }, [userLoading, user, router]);

  const monthDate = date ?? new Date();
  const firstDay = getFirstDayOfMonth(monthDate);
  const lastDay = getLastDayOfMonth(monthDate);
  const firstIso = getDateISOString(firstDay);
  const lastIso = getDateISOString(lastDay);

  const weeksInMonth = useMemo(
    () => getIsoWeeksOverlappingMonth(monthDate),
    [monthDate],
  );

  useEffect(() => {
    if (!listWeekStartRaw) return;
    const valid = weeksInMonth.some(
      (w) => getDateISOString(w.monday) === listWeekStartRaw,
    );
    if (!valid) void setListWeekStart(null);
  }, [weeksInMonth, listWeekStartRaw, setListWeekStart]);

  const listBounds = useMemo(() => {
    if (listThisWeek) {
      return getIsoWeekRangeBounds(new Date());
    }
    if (
      listWeekStartRaw &&
      /^\d{4}-\d{2}-\d{2}$/.test(listWeekStartRaw)
    ) {
      const d = parse(listWeekStartRaw, "yyyy-MM-dd", new Date());
      return getIsoWeekRangeBounds(d);
    }
    return { startIso: firstIso, endIso: lastIso };
  }, [listThisWeek, listWeekStartRaw, firstIso, lastIso]);

  const listFirstIso = listBounds.startIso;
  const listLastIso = listBounds.endIso;

  const weekMondayForSelector = useMemo(() => {
    if (
      !listWeekStartRaw ||
      !/^\d{4}-\d{2}-\d{2}$/.test(listWeekStartRaw)
    ) {
      return null;
    }
    return parse(listWeekStartRaw, "yyyy-MM-dd", new Date());
  }, [listWeekStartRaw]);

  const coursesQuery = useQuery({
    queryKey: [
      "starting-courses",
      listFirstIso,
      listLastIso,
      listThisWeek,
      listWeekStartRaw,
    ],
    queryFn: async () => {
      const res = await searchEntities(
        "courses",
        {
          size: -1,
          expand: ["category"],
          sorts: ["start_date", "title"],
          fields: [
            "id",
            "title",
            "start_date",
            "end_date",
            "category",
            "status",
            "primary_teacher",
            "student_count",
            "main_teacher_count",
            "assistant_teacher_count",
            "first_event_time_from",
            "first_event_time_to",
            "repeat_every",
            "is_recurring",
          ],
        },
        {
          filter_params: [
            {
              field_name: "start_date",
              operator: operatorEnum.gte,
              value: listFirstIso,
            },
            {
              field_name: "start_date",
              operator: operatorEnum.lte,
              value: listLastIso,
            },
          ],
        },
      );
      return (res.data.data ?? []) as courseType[];
    },
    enabled: allowed && !!tenant && !tenantLoading,
  });

  const chartRangeResolved = useMemo(
    () => resolveDateRange(chartPreset, chartFrom, chartTo),
    [chartPreset, chartFrom, chartTo],
  );

  const chartCoursesQuery = useQuery({
    queryKey: [
      "starting-courses-chart",
      chartRangeResolved?.start,
      chartRangeResolved?.end,
    ],
    queryFn: async () => {
      const res = await searchEntities(
        "courses",
        {
          size: -1,
          expand: ["category"],
          sorts: ["start_date"],
          fields: ["start_date", "student_count", "category"],
        },
        {
          filter_params: [
            {
              field_name: "start_date",
              operator: operatorEnum.gte,
              value: chartRangeResolved!.start,
            },
            {
              field_name: "start_date",
              operator: operatorEnum.lte,
              value: chartRangeResolved!.end,
            },
          ],
        },
      );
      return (res.data.data ?? []) as Pick<
        courseType,
        "start_date" | "student_count" | "category"
      >[];
    },
    enabled:
      allowed &&
      !!tenant &&
      !tenantLoading &&
      !!chartRangeResolved?.start &&
      !!chartRangeResolved?.end,
  });

  const chartData = useMemo(() => {
    if (!chartRangeResolved?.start || !chartRangeResolved?.end) return [];
    const courses = chartCoursesQuery.data ?? [];
    const interval = chartInterval;
    const bucketKeys =
      interval === CHART_INTERVAL.month
        ? monthBucketKeys(chartRangeResolved.start, chartRangeResolved.end)
        : weekBucketKeys(chartRangeResolved.start, chartRangeResolved.end);

    const counts = new Map<string, { courses: number; students: number }>();
    for (const k of bucketKeys) {
      counts.set(k, { courses: 0, students: 0 });
    }

    for (const c of courses) {
      const sd = new Date(c.start_date);
      let key: string;
      if (interval === CHART_INTERVAL.month) {
        key = format(sd, "yyyy-MM");
      } else {
        key = getDateISOString(startOfWeek(sd, { weekStartsOn: 1 }));
      }
      const row = counts.get(key);
      if (!row) continue;
      row.courses += 1;
      row.students +=
        typeof c.student_count === "number" ? c.student_count : 0;
    }

    return bucketKeys.map((key) => {
      const row = counts.get(key) ?? { courses: 0, students: 0 };
      let bucketLabel: string;
      if (interval === CHART_INTERVAL.month) {
        bucketLabel = format(
          parse(`${key}-01`, "yyyy-MM-dd", new Date()),
          "MMM yyyy",
        );
      } else {
        bucketLabel = format(
          parse(key, "yyyy-MM-dd", new Date()),
          "MMM d",
        );
      }
      return {
        bucketKey: key,
        bucketLabel,
        coursesCount: row.courses,
        studentsTotal: row.students,
      };
    });
  }, [
    chartCoursesQuery.data,
    chartInterval,
    chartRangeResolved?.end,
    chartRangeResolved?.start,
  ]);

  const chartAggregates = useMemo(() => {
    const courses = chartCoursesQuery.data ?? [];
    const total = courses.length;
    const totalStudents = courses.reduce(
      (s, c) =>
        s + (typeof c.student_count === "number" ? c.student_count : 0),
      0,
    );
    const categories = new Set(
      courses.map((c) => getCategoryDisplayName(c as courseType)),
    ).size;
    return { total, totalStudents, categories };
  }, [chartCoursesQuery.data]);

  const filteredRows = useMemo(() => {
    let list = coursesQuery.data ?? [];
    if (
      fmHmFilterEnabled &&
      courseMonthFilter !== UnpaidShortcutCourseMonthFilter.All
    ) {
      list = list.filter(
        (c) => getCourseMonthType(c.start_date) === courseMonthFilter,
      );
    }
    const needle = (q ?? "").trim().toLowerCase();
    if (needle) {
      list = list.filter((c) => c.title.toLowerCase().includes(needle));
    }
    return list;
  }, [
    coursesQuery.data,
    fmHmFilterEnabled,
    courseMonthFilter,
    q,
  ]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { sortOrder: number; courses: courseType[] }>();
    for (const c of filteredRows) {
      const name = getCategoryDisplayName(c);
      const sortOrder = getCategorySortOrderFromCourse(c);
      let slot = map.get(name);
      if (!slot) {
        slot = { sortOrder, courses: [] };
        map.set(name, slot);
      }
      slot.courses.push(c);
    }
    for (const slot of Array.from(map.values())) {
      slot.courses.sort((a: courseType, b: courseType) => {
        const da = new Date(a.start_date).getTime();
        const db = new Date(b.start_date).getTime();
        if (da !== db) return da - db;
        return a.title.localeCompare(b.title);
      });
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const oa = a[1].sortOrder;
        const ob = b[1].sortOrder;
        if (oa !== ob) return oa - ob;
        return a[0].localeCompare(b[0]);
      })
      .map(([name, slot]) => [name, slot.courses] as [string, courseType[]]);
  }, [filteredRows]);

  const rawCount = coursesQuery.data?.length ?? 0;
  const hasFmHmFilteredOut =
    fmHmFilterEnabled &&
    courseMonthFilter !== UnpaidShortcutCourseMonthFilter.All &&
    rawCount > 0 &&
    filteredRows.length === 0 &&
    !(q ?? "").trim();

  const emptyListMessage = listThisWeek
    ? "No classes begin this week."
    : listWeekStartRaw
      ? "No classes begin in the week you selected."
      : "No classes begin in this month.";


  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">Starting courses</h1>
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

  if (!userLoading && !user) {
    return null;
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-text-muted" />
      </div>
    );
  }

  return  (
<PageContainer width="wide" className="min-w-0 max-w-full space-y-6">
      <header className="space-y-3">
        <Link
          href="/shortcuts"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Shortcuts
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 sm:max-w-[min(100%,28rem)]">
          </div>
          <div className="flex w-full min-w-0 shrink-0 flex-col gap-3 sm:w-auto sm:items-end">
            <Button
              type="button"
              size="sm"
              variant={listThisWeek ? "primary" : "secondary"}
              className="w-full sm:w-auto"
              onClick={() => {
                void setListThisWeek(!listThisWeek);
                if (!listThisWeek) void setListWeekStart(null);
              }}
            >
              Starting this week
            </Button>
            <YearMonthSelector
              label="Month"
              date={monthDate}
              setDate={(d) => setDate(d)}
              showWeek={!listThisWeek}
              weekStartMonday={weekMondayForSelector}
              setWeekStartMonday={(d) => {
                void setListWeekStart(
                  d ? getDateISOString(startOfWeek(d, { weekStartsOn: 1 })) : null,
                );
              }}
            />
            {fmHmFilterEnabled ? (
              <div className="flex w-full min-w-[12rem] flex-col gap-1.5 sm:w-56">
                <label htmlFor="starting-courses-month-type" className="text-xs">
                  When the class starts in the month
                </label>
                <Select
                  className="h-9 w-full"
                  placeholder="All classes"
                  items={[
                    {
                      label: "All classes",
                      value: UnpaidShortcutCourseMonthFilter.All,
                    },
                    {
                      label: COURSE_START_TIMING_LABEL_EARLY,
                      value: UnpaidShortcutCourseMonthFilter.FM,
                    },
                    {
                      label: COURSE_START_TIMING_LABEL_LATER,
                      value: UnpaidShortcutCourseMonthFilter.HM,
                    },
                  ]}
                  value={courseMonthFilter}
                  onValueChange={(v) => {
                    if (v != null)
                      setCourseMonthRaw(v as UnpaidShortcutCourseMonthFilter);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
        <p className="text-text-muted text-sm max-w-2xl">
          See classes that begin in the month or week you pick, or jump to this
          calendar week. The chart below counts new classes and students by week or
          month over a date range you choose.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Starts over time</CardTitle>
            <CardDescription>
              {chartRangeResolved
                ? `${format(parse(chartRangeResolved.start, "yyyy-MM-dd", new Date()), "MMM d, yyyy")} – ${format(parse(chartRangeResolved.end, "yyyy-MM-dd", new Date()), "MMM d, yyyy")}`
                : "Choose a valid date range."}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <DateRangeFilter
              className="min-w-0 sm:items-end"
              preset={chartPreset}
              onPresetChange={(p) => void setChartPreset(p)}
              customFrom={chartFrom}
              customTo={chartTo}
              onCustomFromChange={(v) => {
                void setChartFrom(v);
              }}
              onCustomToChange={(v) => {
                void setChartTo(v);
              }}
              presetIds={STARTING_CHART_PRESETS}
              fromInputId="sc-chart-from"
              toInputId="sc-chart-to"
            />
            <div className="flex w-full min-w-[10rem] flex-col gap-1.5 sm:w-48">
              <label htmlFor="sc-chart-interval" className="text-xs">
                Chart step
              </label>
              <Select
                className="h-9 w-full"
                items={[
                  { label: "Weekly", value: CHART_INTERVAL.week },
                  { label: "Monthly", value: CHART_INTERVAL.month },
                ]}
                value={chartInterval}
                onValueChange={(v) => {
                  if (v == null) return;
                  void setChartInterval(
                    v === CHART_INTERVAL.month
                      ? CHART_INTERVAL.month
                      : CHART_INTERVAL.week,
                  );
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!chartRangeResolved ? (
            <p className="text-text-muted text-sm py-6 text-center border rounded-lg">
              Pick a range to load the chart.
            </p>
          ) : chartCoursesQuery.isLoading ? (
            <Skeleton className="h-[280px] w-full rounded-lg" aria-busy />
          ) : chartCoursesQuery.isError ? (
            <p className="text-danger text-sm py-6 text-center" role="alert">
              Failed to load chart data.
            </p>
          ) : (
            <ChartContainer
              config={chartTrendConfig}
              className="h-[min(360px,50vh)] w-full aspect-auto [&_.recharts-responsive-container]:min-h-[260px]"
            >
              <RechartsLineChart
                data={chartData}
                margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="bucketLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  yAxisId="left"
                  width={40}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  width={44}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="coursesCount"
                  stroke="var(--color-coursesCount)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="studentsTotal"
                  stroke="var(--color-studentsTotal)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </RechartsLineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {chartRangeResolved ? (
        chartCoursesQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-[4.5rem] rounded-xl" aria-busy />
            <Skeleton className="h-[4.5rem] rounded-xl" aria-busy />
            <Skeleton className="h-[4.5rem] rounded-xl" aria-busy />
          </div>
        ) : chartCoursesQuery.isError ? null : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-text-muted">
                Classes starting
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {chartAggregates.total}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-text-muted">
                Students (total)
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {chartAggregates.totalStudents}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-text-muted">Categories</div>
              <div className="text-2xl font-semibold tabular-nums">
                {chartAggregates.categories}
              </div>
            </div>
          </div>
        )
      ) : null}

      {coursesQuery.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-10 w-full max-w-sm" />
          {[1, 2].map((section) => (
            <section key={section} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <CardGridSkeleton count={3} cardClassName="min-h-32" />
            </section>
          ))}
        </div>
      ) : coursesQuery.isError ? (
        <p className="text-danger text-sm" role="alert">
          Failed to load courses. Please try again.
        </p>
      ) : rawCount === 0 ? (
        <p className="text-text-muted text-sm py-4 text-center border rounded-lg text-balance">
          {emptyListMessage}
        </p>
      ) : hasFmHmFilteredOut ? (
        <p className="text-text-muted text-sm py-4 text-center border rounded-lg text-balance">
          No classes match the month and the start date you chose above.
        </p>
      ) : (
        <>
          <div className="space-y-4">
            <div className="relative w-full max-w-sm min-w-0">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Search by class name…"
                value={q ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  void setQ(v.length ? v : null);
                }}
                className="h-9 pl-8 text-sm"
                aria-label="Search by class name"
              />
            </div>
            {filteredRows.length === 0 ? (
              <p className="text-text-muted text-sm py-4 text-center border rounded-lg text-balance">
                No classes match &quot;{(q ?? "").trim()}&quot;.
              </p>
            ) : (
              <div className="space-y-8">
                {byCategory.map(([catName, courses]) => (
                  <div key={catName} className="rounded-xl border">
                    <div className="border-b bg-surface-sunken/30 px-4 py-3">
                      <h2 className="text-lg font-semibold break-words">
                        {catName}
                      </h2>
                      <p className="text-text-muted text-xs">
                        {courses.length} class
                        {courses.length === 1 ? "" : "es"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 p-4">
                      {courses.map((c) => (
                        <StartingCourseCard
                          key={c.id}
                          course={c}
                          showFmHmType={fmHmFilterEnabled}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </PageContainer>
);
}
