"use client";

import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { usePageHeader } from "@/components/shell/use-page-header";
import { updateEntity } from "@/app/client-api/utils";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { axiosClient } from "@/lib/api";
import {
  Button,
  Checkbox,
  Select,
  Skeleton,
} from "@/components/primitives";
import { DateRangeFilter } from "@/components/form/date-range-filter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/reports/report-table";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/charts/chart";
import { useToast } from "@/components/primitives";
import { canAccessUserActivity } from "@/helpers/authorization";
import { formatDate, formatDateTime } from "@/helpers/date";
import {
  isDateRangePreset,
  resolveDateRange,
  type DateRangePreset,
} from "@/helpers/date-range-presets";
import { useUser } from "@/hooks/useUser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import Link from "next/link";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from "nuqs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { dashboardMetricGridClassName } from "@/lib/ui-remediation/r7-dashboard-layout-classes";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from "recharts";

type LoginTrendsBody = {
  isError?: boolean;
  message?: string;
  series?: Array<{
    date: string;
    total_logins: number;
    unique_users: number;
  }>;
  totals?: { total_logins: number; sum_unique_users_per_day: number };
  timezone?: string;
};

type InactiveBody = {
  isError?: boolean;
  message?: string;
  results?: Array<{
    id: number;
    name: string;
    email: string;
    roles: string;
    created_at: string | null;
    last_login: string | null;
    is_student_only?: boolean;
    is_active?: boolean;
  }>;
  count?: number;
  page?: number;
  page_size?: number;
};

type InactiveUserRow = NonNullable<InactiveBody["results"]>[number];

function canDisableRow(
  row: InactiveUserRow,
  locallyDisabledIds: Set<number>,
): boolean {
  return (
    !row.is_student_only &&
    row.is_active !== false &&
    !locallyDisabledIds.has(row.id)
  );
}

const chartConfig = {
  total_logins: {
    label: "Logins",
    theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
  },
  unique_users: {
    label: "Unique users",
    theme: { light: "var(--chart-2)", dark: "var(--chart-2)" },
  },
} satisfies ChartConfig;

export default function LoginActivityPage() {
  const { user, isLoading: userLoading } = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [presetRaw, setPreset] = useQueryState(
    "preset",
    parseAsString.withDefault("last3m"),
  );
  const preset: DateRangePreset = isDateRangePreset(presetRaw)
    ? presetRaw
    : "last3m";

  const [customFrom, setCustomFrom] = useQueryState("from", parseAsString);
  const [customTo, setCustomTo] = useQueryState("to", parseAsString);

  const [inactiveDays, setInactiveDays] = useQueryState(
    "inactiveDays",
    parseAsInteger.withDefault(30),
  );
  const [minAccountAge, setMinAccountAge] = useQueryState(
    "minAccountAge",
    parseAsInteger.withDefault(5),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [excludeStudents, setExcludeStudents] = useQueryState(
    "excludeStudents",
    parseAsBoolean.withDefault(false),
  );

  /** Hide disable while cached list is stale after a successful disable. */
  const [locallyDisabledIds, setLocallyDisabledIds] = useState(
    () => new Set<number>(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set<number>(),
  );

  const range = useMemo(
    () => resolveDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  useEffect(() => {
    if (!userLoading && user && !canAccessUserActivity(user)) {
      router.replace("/");
    }
  }, [userLoading, user, router]);

  const trendsQuery = useQuery({
    queryKey: ["userActivityLoginTrends", range?.start, range?.end],
    queryFn: async () => {
      const res = await axiosClient.get<LoginTrendsBody>(
        "reports/user-activity/login-trends",
        { params: { start: range!.start, end: range!.end } },
      );
      const body = res.data;
      if (body.isError) {
        throw new Error(body.message || "Failed to load trends");
      }
      return body;
    },
    enabled: !!range,
  });

  const inactiveQuery = useQuery({
    queryKey: [
      "userActivityInactive",
      inactiveDays,
      minAccountAge,
      page,
      excludeStudents,
    ],
    queryFn: async () => {
      const res = await axiosClient.get<InactiveBody>(
        "reports/user-activity/inactive-users",
        {
          params: {
            inactive_threshold_days: inactiveDays,
            min_account_age_days: minAccountAge,
            page,
            page_size: 25,
            ...(excludeStudents ? { exclude_students: true } : {}),
          },
        },
      );
      const body = res.data;
      if (body.isError) {
        throw new Error(body.message || "Failed to load inactive users");
      }
      return body;
    },
    enabled: !!user && canAccessUserActivity(user),
  });

  useEffect(() => {
    const ids = new Set(inactiveQuery.data?.results?.map((r) => r.id) ?? []);
    setLocallyDisabledIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [inactiveQuery.data?.results]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    inactiveDays,
    minAccountAge,
    excludeStudents,
    page,
    inactiveQuery.data?.results,
  ]);

  const inactiveResults = inactiveQuery.data?.results ?? [];

  const disableEligibleRows = useMemo(
    () =>
      inactiveResults.filter((row) => canDisableRow(row, locallyDisabledIds)),
    [inactiveResults, locallyDisabledIds],
  );

  const allEligibleSelected =
    disableEligibleRows.length > 0 &&
    disableEligibleRows.every((row) => selectedIds.has(row.id));
  const someEligibleSelected = disableEligibleRows.some((row) =>
    selectedIds.has(row.id),
  );
  const selectAllChecked = allEligibleSelected;
  const selectAllIndeterminate =
    someEligibleSelected && !allEligibleSelected;

  const toggleRowSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(
      checked
        ? new Set(disableEligibleRows.map((row) => row.id))
        : new Set(),
    );
  };

  const disableInactiveUserMutation = useMutation({
    mutationFn: (userId: number) =>
      updateEntity("users", userId, { is_active: false }),
    onSuccess: (_data, userId) => {
      setLocallyDisabledIds((prev) => new Set(prev).add(userId));
      toast.add({ title: "Account disabled" });
      void queryClient.invalidateQueries({ queryKey: ["userActivityInactive"] });
    },
    onError: () => {
      toast.add({
        title: "Could not disable account",
      });
    },
  });

  const bulkDisableMutation = useMutation({
    mutationFn: async (userIds: number[]) => {
      const results = await Promise.allSettled(
        userIds.map((id) => updateEntity("users", id, { is_active: false })),
      );
      const succeeded: number[] = [];
      let failed = 0;
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          succeeded.push(userIds[index]);
        } else {
          failed += 1;
        }
      });
      return { succeeded, failed, total: userIds.length };
    },
    onSuccess: ({ succeeded, failed, total }) => {
      if (succeeded.length > 0) {
        setLocallyDisabledIds((prev) => {
          const next = new Set(prev);
          succeeded.forEach((id) => next.add(id));
          return next;
        });
      }
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ["userActivityInactive"] });
      if (failed === 0) {
        toast.add({
          title:
            succeeded.length === 1
              ? "Account disabled"
              : `Disabled ${succeeded.length} accounts`,
        });
      } else {
        toast.add({
          title: `Disabled ${succeeded.length} of ${total}`,
          description: `${failed} could not be disabled`,
        });
      }
    },
    onError: () => {
      toast.add({
        title: "Could not disable accounts",
      });
    },
  });

  const chartData = useMemo(() => {
    const series = trendsQuery.data?.series ?? [];
    return series.map((row) => ({
      ...row,
      dateLabel: format(parseISO(row.date), "MMM d"),
    }));
  }, [trendsQuery.data?.series]);

  const maxDailyUnique = useMemo(() => {
    const series = trendsQuery.data?.series ?? [];
    return series.reduce((m, r) => Math.max(m, r.unique_users), 0);
  }, [trendsQuery.data?.series]);


  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">Login activity</h1>
        ),
      }),
      [],
    ),
  );
  if (userLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
                <div
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (!user || !canAccessUserActivity(user)) {
    return null;
  }

  const totalPages = Math.max(
    1,
    Math.ceil((inactiveQuery.data?.count ?? 0) / 25),
  );

  return  (
<PageContainer width="wide" className="space-y-8">
      <Link
        href="/organizations/user-activity"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        User activity
      </Link>

      <div>
        <p className="text-text-muted text-sm max-w-2xl mt-2">
          Sign-in counts come from your school’s login records. Dates follow
          your school’s timezone setting. Accounts that have not signed in
          recently are listed below; adjust the filters to match how you define
          “inactive.”
        </p>
      </div>

      <PageSection>
        <div className="space-y-4 border-b border-border pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-text-primary">Sign-in trend</h2>
              <p className="text-sm text-text-secondary">
                {range
                  ? `${formatDate(range.start, "MMM d, yyyy")} – ${formatDate(range.end, "MMM d, yyyy")}`
                  : "Choose a valid date range."}
              </p>
            </div>
            <DateRangeFilter
              className="min-w-0 sm:items-end"
              preset={preset}
              onPresetChange={(p) => void setPreset(p)}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={(v) => {
                void setCustomFrom(v);
              }}
              onCustomToChange={(v) => {
                void setCustomTo(v);
              }}
              fromInputId="ua-from"
              toInputId="ua-to"
            />
          </div>
          <div className="space-y-4">
            {!range ? (
              <p className="text-text-muted text-sm py-6 text-center border rounded-lg">
                Pick two dates to load the chart.
              </p>
            ) : trendsQuery.isLoading ? (
              <Skeleton className="h-[280px] w-full rounded-lg" aria-busy="true" />
            ) : trendsQuery.isError ? (
              <p className="text-danger text-sm py-6 text-center" role="alert">
                {trendsQuery.error instanceof Error
                  ? trendsQuery.error.message
                  : "Failed to load."}
              </p>
            ) : (
              <>
                <div className={`${dashboardMetricGridClassName(2)} sm:max-w-md`}>
                  <div className="rounded-lg border bg-surface-sunken/40 px-3 py-2">
                    <p className="text-text-muted text-xs">Total logins</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {trendsQuery.data?.totals?.total_logins?.toLocaleString() ??
                        "0"}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-surface-sunken/40 px-3 py-2">
                    <p className="text-text-muted text-xs">
                      Busiest day (unique)
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {maxDailyUnique.toLocaleString()}
                    </p>
                  </div>
                </div>
                <ChartContainer
                  config={chartConfig}
                  className="h-[min(360px,50vh)] w-full aspect-auto [&_.recharts-responsive-container]:min-h-[260px]"
                >
                  <RechartsLineChart
                    data={chartData}
                    margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="dateLabel"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      width={44}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line
                      type="monotone"
                      dataKey="total_logins"
                      stroke="var(--color-total_logins)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="unique_users"
                      stroke="var(--color-unique_users)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </RechartsLineChart>
                </ChartContainer>
                {trendsQuery.data?.timezone ? (
                  <p className="text-text-muted text-xs">
                    Day boundaries use timezone: {trendsQuery.data.timezone}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </PageSection>

      <PageSection dominant>
        <div className="space-y-4 border-b border-border pb-6">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-text-primary">Likely inactive accounts</h2>
          <p className="text-sm text-text-secondary">
            Active accounts only—disabled accounts are not listed. People
            whose account is at least as old as the first control and who have
            not signed in within the second. Signing in updates their “last
            sign-in” after your school runs the one-time backfill (if needed).
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2 w-[200px]">
              <span className="text-sm font-medium text-text-secondary">Minimum account age</span>
              <Select
                className="w-full"
                value={String(minAccountAge)}
                onValueChange={(v) => {
                  void setMinAccountAge(Number(v));
                  void setPage(1);
                }}
                items={[3, 5, 7, 14].map((d) => ({
                  value: String(d),
                  label: `${d} days`,
                }))}
              />
            </div>
            <div className="space-y-2 w-[200px]">
              <span className="text-sm font-medium text-text-secondary">No sign-in for</span>
              <Select
                className="w-full"
                value={String(inactiveDays)}
                onValueChange={(v) => {
                  void setInactiveDays(Number(v));
                  void setPage(1);
                }}
                items={[7, 14, 30, 60, 90].map((d) => ({
                  value: String(d),
                  label: `${d} days`,
                }))}
              />
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="exclude-students"
              checked={excludeStudents}
              onCheckedChange={(v) => {
                void setExcludeStudents(v === true);
                void setPage(1);
              }}
            />
            <label htmlFor="exclude-students" className="text-sm font-normal leading-snug cursor-pointer text-text-primary">Exclude people who are only students</label>
          </div>

          {inactiveQuery.isLoading ? (
            <Skeleton className="h-48 w-full rounded-lg" aria-busy="true" />
          ) : inactiveQuery.isError ? (
            <p className="text-danger text-sm" role="alert">
              {inactiveQuery.error instanceof Error
                ? inactiveQuery.error.message
                : "Failed to load."}
            </p>
          ) : (inactiveQuery.data?.results?.length ?? 0) === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center border rounded-lg">
              No accounts match these rules.
            </p>
          ) : (
            <>
              {selectedIds.size > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-hover px-3 py-2">
                  <p className="text-sm text-text-muted">
                    {selectedIds.size} selected
                  </p>
                  <ConfirmationDialog
                    title={`Disable ${selectedIds.size} account${selectedIds.size === 1 ? "" : "s"}?`}
                    content="These people will not be able to sign in until an administrator re-enables them from their profile."
                    onConfirm={() =>
                      bulkDisableMutation.mutate(Array.from(selectedIds))
                    }
                    isLoading={bulkDisableMutation.isPending}
                  >
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={bulkDisableMutation.isPending}
                      isLoading={bulkDisableMutation.isPending}
                    >
                      Disable selected ({selectedIds.size})
                    </Button>
                  </ConfirmationDialog>
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[1%]">
                      {disableEligibleRows.length > 0 ? (
                        <Checkbox
                          checked={selectAllChecked}
                          indeterminate={selectAllIndeterminate}
                          onCheckedChange={handleSelectAll}
                          disabled={bulkDisableMutation.isPending}
                          aria-label="Select all on page"
                        />
                      ) : null}
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Account created</TableHead>
                    <TableHead>Last sign-in</TableHead>
                    <TableHead className="w-[1%] whitespace-nowrap">
                      Profile
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inactiveQuery.data!.results!.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {canDisableRow(row, locallyDisabledIds) ? (
                          <Checkbox
                            checked={selectedIds.has(row.id)}
                            onCheckedChange={() => toggleRowSelection(row.id)}
                            disabled={bulkDisableMutation.isPending}
                            aria-label={`Select ${row.name}`}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell className="text-text-muted">
                        {row.roles}
                      </TableCell>
                      <TableCell>
                        {row.created_at
                          ? formatDateTime(row.created_at)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {row.last_login ? formatDateTime(row.last_login) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Link
                            href={`/users/${row.id}`}
                            className="text-primary text-sm font-medium hover:underline"
                          >
                            Open profile
                          </Link>
                          {canDisableRow(row, locallyDisabledIds) && (
                            <ConfirmationDialog
                              title="Disable this account?"
                              content={`${row.name} will not be able to sign in until an administrator re-enables them from their profile.`}
                              onConfirm={() =>
                                disableInactiveUserMutation.mutate(row.id)
                              }
                              isLoading={
                                disableInactiveUserMutation.isPending &&
                                disableInactiveUserMutation.variables === row.id
                              }
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto gap-1.5 px-0 text-danger"
                                isLoading={
                                  disableInactiveUserMutation.isPending &&
                                  disableInactiveUserMutation.variables ===
                                    row.id
                                }
                                disabled={
                                  disableInactiveUserMutation.isPending &&
                                  disableInactiveUserMutation.variables !==
                                    row.id
                                }
                              >
                                Disable account
                              </Button>
                            </ConfirmationDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-text-muted text-sm">
                  {(inactiveQuery.data?.count ?? 0).toLocaleString()} total
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => void setPage(Math.max(1, page - 1))}
                  >
                    <NavArrowLeft className="size-4" aria-hidden />
                    Previous
                  </Button>
                  <span className="text-sm text-text-muted tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => void setPage(page + 1)}
                  >
                    Next
                    <NavArrowRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
        </div>
      </PageSection>
    </PageContainer>
);
}
