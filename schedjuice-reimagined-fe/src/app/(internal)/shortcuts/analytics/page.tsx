"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/reports/report-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/charts/chart";
import { DatePicker } from "@/components/date/date-picker";
import { Select } from "@/components/primitives";
import {
  ANALYTICS_PRESET_IDS,
  ANALYTICS_PRESET_LABELS,
  type AnalyticsPreset,
  resolveAnalyticsDateRange,
} from "@/helpers/analytics-date-range";
import { canAccessAnalyticsShortcut } from "@/helpers/authorization";
import { formatDate, getDateISOString } from "@/helpers/date";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { axiosClient } from "@/lib/api";
import type {
  AnalyticsActiveBreakdownApi,
  AnalyticsRevenueApi,
  AnalyticsTeachingLoadApi,
  AnalyticsTimeSeriesApi,
} from "@/types/analytics";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parse } from "date-fns";
import { useMemo, useState } from "react";
import { Checkbox, Skeleton } from "@/components/primitives";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

const SERIES_KEYS = [
  "course_starts",
  "course_ends",
  "verified_payments",
  "student_enrollments",
  "removals",
] as const;

const SERIES_LABELS: Record<(typeof SERIES_KEYS)[number], string> = {
  course_starts: "Course starts",
  course_ends: "Course ends",
  verified_payments: "Verified payments",
  student_enrollments: "New enrollments",
  removals: "Removals",
};

/** Theme tokens in globals.css are `oklch(...)`; do not wrap in `hsl()` or SVG stroke/fill is invalid. */
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function useRangeQuery(preset: AnalyticsPreset, customFrom: string, customTo: string) {
  return useMemo(() => {
    if (preset === "custom") {
      return resolveAnalyticsDateRange("custom", customFrom, customTo);
    }
    return resolveAnalyticsDateRange(preset, null, null);
  }, [preset, customFrom, customTo]);
}

const ShortcutsAnalyticsPage = () => {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const { tenant } = useTenant();
  const currency = tenant?.currency_symbol ?? "";

  const [preset, setPreset] = useState<AnalyticsPreset>("last_month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [revenueInterval, setRevenueInterval] = useState<"week" | "month">("month");
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SERIES_KEYS.map((k) => [k, true])),
  );

  const range = useRangeQuery(
    preset,
    customFrom,
    customTo,
  );

  const start = range?.start ?? "";
  const end = range?.end ?? "";

  const timeSeriesQuery = useQuery({
    queryKey: ["analytics-time-series", start, end],
    queryFn: async () => {
      const { data } = await axiosClient.get<AnalyticsTimeSeriesApi>(
        "reports/analytics/time-series",
        { params: { start, end } },
      );
      return data;
    },
    enabled: Boolean(range),
  });

  const activeQuery = useQuery({
    queryKey: ["analytics-active-breakdown"],
    queryFn: async () => {
      const { data } = await axiosClient.get<AnalyticsActiveBreakdownApi>(
        "reports/analytics/active-breakdown",
      );
      return data;
    },
  });

  const revenueQuery = useQuery({
    queryKey: ["analytics-revenue", start, end, revenueInterval],
    queryFn: async () => {
      const { data } = await axiosClient.get<AnalyticsRevenueApi>(
        "reports/analytics/revenue",
        { params: { start, end, interval: revenueInterval } },
      );
      return data;
    },
    enabled: !!range,
  });

  const teachingQuery = useQuery({
    queryKey: ["analytics-teaching-load"],
    queryFn: async () => {
      const { data } = await axiosClient.get<AnalyticsTeachingLoadApi>(
        "reports/analytics/teaching-load",
      );
      return data;
    },
  });

  const lineData = useMemo(() => {
    const series = timeSeriesQuery.data?.series;
    if (!series) return [];
    return series.map((row) => ({
      ...row,
      label: formatDate(row.date, "MMM d"),
    }));
  }, [timeSeriesQuery.data?.series]);

  const activeBarRows = useMemo(() => {
    const list = activeQuery.data?.categories ?? [];
    return list.map((c) => {
      const n = (v: unknown) => {
        const x = Number(v);
        return Number.isFinite(x) ? x : 0;
      };
      return {
        name: c.category_name || `Category ${c.category_id}`,
        c_fm: n(c.active_courses_fm),
        c_hm: n(c.active_courses_hm),
        s_fm: n(c.active_student_seats_fm),
        s_hm: n(c.active_student_seats_hm),
        courses: n(c.active_courses),
        seats: n(c.active_student_seats),
      };
    });
  }, [activeQuery.data?.categories]);

  const canView = user && canAccessAnalyticsShortcut(user);

  usePageHeader(
    useMemo(
      () =>
        canView
          ? {
              breadcrumb: (
                <h1 className="font-serif text-lg text-text-primary">
                  Analytics
                </h1>
              ),
            }
          : null,
      [canView],
    ),
  );

  if (!userLoading && user && !canView) {
    router.replace("/shortcuts");
    return null;
  }

  if (userLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-text-muted" />
      </div>
    );
  }

  const fmHm = activeQuery.data?.is_fm_hm_breakdown_enabled ?? false;

  return  (
<PageContainer width="default" className="space-y-8">
      <Link
        href="/shortcuts"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Shortcuts
      </Link>

      <div>
        <p className="text-text-muted text-sm max-w-2xl mt-2">
          Operations snapshot: daily activity in the selected range, current seats by category, revenue change by
          period, and teaching load on active courses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
          <CardDescription>
            Used for daily trends and revenue. Teaching load and active-by-category are current snapshots.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-2 min-w-[180px]">
            <label>Preset</label>
            <Select
              items={ANALYTICS_PRESET_IDS.map((id) => ({
                label: ANALYTICS_PRESET_LABELS[id],
                value: id,
              }))}
              value={preset}
              onValueChange={(v) => {
                if (v != null) setPreset(v as AnalyticsPreset);
              }}
            />
          </div>
          {preset === "custom" ? (
            <>
              <div className="space-y-2">
                <label>From</label>
                <DatePicker
                  date={
                    customFrom
                      ? parse(customFrom, "yyyy-MM-dd", new Date())
                      : undefined
                  }
                  setDate={(d) => setCustomFrom(d ? getDateISOString(d) : "")}
                />
              </div>
              <div className="space-y-2">
                <label>To</label>
                <DatePicker
                  date={
                    customTo ? parse(customTo, "yyyy-MM-dd", new Date()) : undefined
                  }
                  setDate={(d) => setCustomTo(d ? getDateISOString(d) : "")}
                />
              </div>
            </>
          ) : null}
          {range ? (
            <p className="text-sm text-text-muted">
              {range.start} → {range.end}
            </p>
          ) : (
            <p className="text-sm text-danger">Pick valid custom dates.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily activity</CardTitle>
          <CardDescription>
            Counts per day in your school timezone ({timeSeriesQuery.data?.timezone ?? "…"}). Toggle series below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {SERIES_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={visible[key] ?? true}
                  onCheckedChange={(c) =>
                    setVisible((prev) => ({ ...prev, [key]: Boolean(c) }))
                  }
                />
                {SERIES_LABELS[key]}
              </label>
            ))}
          </div>
          {timeSeriesQuery.isLoading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : timeSeriesQuery.isError || !lineData.length ? (
            <p className="text-sm text-text-muted">No data for this range.</p>
          ) : (
            <ChartContainer
              config={{}}
              className="aspect-auto min-h-[280px] h-[min(360px,70vh)] w-full"
            >
              <LineChart data={lineData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} width={40} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {SERIES_KEYS.map((key, i) =>
                  visible[key] ? (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={SERIES_LABELS[key]}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      dot={false}
                      strokeWidth={2}
                    />
                  ) : null,
                )}
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Active courses and seats</CardTitle>
            <CardDescription>
              As of now. {fmHm ? "FM vs HM follows each course’s start day (full month vs half month)." : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeQuery.isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <>
                {fmHm ? (
                  <p className="text-xs text-text-muted mb-2">
                    Totals — courses: FM {activeQuery.data?.totals.active_courses_fm}, HM{" "}
                    {activeQuery.data?.totals.active_courses_hm}. Seats: FM{" "}
                    {activeQuery.data?.totals.active_student_seats_fm}, HM{" "}
                    {activeQuery.data?.totals.active_student_seats_hm}.
                  </p>
                ) : null}
                {/* Two Recharts <BarChart> blocks: a single chart with two different stackId values
                    often produces invisible bars; split courses vs seats. */}
                <div className="space-y-6 w-full min-w-0">
                  {activeBarRows.length === 0 ? (
                    <p className="text-sm text-text-muted">No active courses in any category.</p>
                  ) : fmHm ? (
                    <>
                      <div>
                        <p className="text-xs font-medium text-text-muted mb-1">Active courses (FM + HM)</p>
                        <div className="h-[220px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activeBarRows} margin={{ left: 4, right: 8, top: 4, bottom: 56 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                              <XAxis
                                dataKey="name"
                                tick={{ fontSize: 9 }}
                                angle={-30}
                                textAnchor="end"
                                height={64}
                                interval={0}
                              />
                              <YAxis
                                allowDecimals={false}
                                width={48}
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
                              />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Bar dataKey="c_fm" name="FM" stackId="a" fill="var(--chart-1)" />
                              <Bar dataKey="c_hm" name="HM" stackId="a" fill="var(--chart-2)" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-muted mb-1">Active student seats (FM + HM)</p>
                        <div className="h-[220px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activeBarRows} margin={{ left: 4, right: 8, top: 4, bottom: 56 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                              <XAxis
                                dataKey="name"
                                tick={{ fontSize: 9 }}
                                angle={-30}
                                textAnchor="end"
                                height={64}
                                interval={0}
                              />
                              <YAxis
                                allowDecimals={false}
                                width={48}
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
                              />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Bar dataKey="s_fm" name="FM" stackId="a" fill="var(--chart-3)" />
                              <Bar dataKey="s_hm" name="HM" stackId="a" fill="var(--chart-4)" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activeBarRows} margin={{ left: 4, right: 8, top: 8, bottom: 56 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            angle={-35}
                            textAnchor="end"
                            height={64}
                            interval={0}
                          />
                          <YAxis
                            allowDecimals={false}
                            width={48}
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="courses" name="Active courses" fill="var(--chart-1)" />
                          <Bar dataKey="seats" name="Active student seats" fill="var(--chart-2)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Teaching load</CardTitle>
            <CardDescription>
              Active courses only. Teachers = role with seniority set and not “Other”. Assignments may count the same
              person on multiple courses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {teachingQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <p className="text-sm text-text-muted">
                  Distinct teachers (all categories): {teachingQuery.data?.distinct_teachers_all_categories ?? 0}
                </p>
                <ul className="text-sm space-y-1 border rounded-md divide-y max-h-[min(280px,40vh)] overflow-y-auto">
                  {(teachingQuery.data?.categories ?? []).map((c) => (
                    <li key={c.category_id} className="flex justify-between gap-4 px-3 py-2">
                      <span className="truncate">{c.category_name}</span>
                      <span className="shrink-0 text-text-muted">
                        {c.teacher_assignments} assignments · {c.distinct_teachers} people
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Revenue by period</CardTitle>
            <CardDescription>
              Verified payments. Amount uses actual value when set, otherwise parsed. Line shows period-over-period
              change (delta).
            </CardDescription>
          </div>
          <div className="space-y-2 w-full sm:w-40">
            <label>Interval</label>
            <Select
              items={[
                { label: "Weekly", value: "week" },
                { label: "Monthly", value: "month" },
              ]}
              value={revenueInterval}
              onValueChange={(v) => {
                if (v != null) setRevenueInterval(v as "week" | "month");
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {revenueQuery.isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : !revenueQuery.data?.series?.length ? (
            <p className="text-sm text-text-muted">No verified revenue in this range.</p>
          ) : (
            <ChartContainer
              config={{}}
              className="aspect-auto min-h-[240px] h-[min(320px,60vh)] w-full"
            >
              <LineChart
                data={revenueQuery.data.series.map((r) => ({
                  label: r.period.label,
                  delta: r.revenue_delta != null ? Number(r.revenue_delta) : 0,
                  total: Number(r.total),
                }))}
                margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${currency}${v}`}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as { label: string; delta: number; total: number };
                    return (
                      <div className="rounded-md border bg-surface px-2 py-1.5 text-xs shadow-sm">
                        <div className="font-medium">{row.label}</div>
                        <div>Total: {currency}{row.total}</div>
                        <div>Delta vs previous: {currency}{row.delta}</div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="delta"
                  name="Revenue delta"
                  stroke="var(--chart-1)"
                  dot
                  strokeWidth={2}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </PageContainer>
);
};

export default ShortcutsAnalyticsPage;
