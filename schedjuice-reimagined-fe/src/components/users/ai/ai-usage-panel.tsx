"use client";
import { Button, Skeleton } from "@/components/primitives";
import { Progress } from "@/components/misc/progress";

import { fetchUserAiUsage } from "@/app/client-api/ai-user-preferences";
import { UsageTrendBars } from "@/components/org/ai/usage-trend-bars";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { limitSourceLabel } from "@/lib/ai/budget-footer";
import { cn } from "@/lib/utils";
import { formatAiTokens, formatAiUsd, formatCacheHitRate } from "@/types/ai-usage";
import { useQuery } from "@tanstack/react-query";
import { parseAsIsoDateTime, useQueryState } from "nuqs";
import { useMemo } from "react";

export function AiUsagePanel({ userId }: { userId: number }) {
  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );

  const monthDate = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
    [date],
  );

  const usageQuery = useQuery({
    queryKey: [
      "userAiUsage",
      userId,
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
    ],
    queryFn: () =>
      fetchUserAiUsage(userId, {
        year: monthDate.getFullYear(),
        month: monthDate.getMonth() + 1,
      }),
  });

  return (
    <div className="rounded-lg border border-border bg-surface text-text-primary [overflow-anchor:none]">
      <div className="flex flex-col gap-1.5 p-6 flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl leading-none tracking-tight">Usage</h3>
          <p className="text-sm text-text-secondary">AI requests and spend for this user</p>
        </div>
        <div>
          <p className="mb-1 text-sm text-text-muted">Month</p>
          <YearMonthSelector date={monthDate} setDate={setDate} />
        </div>
      </div>
      <div className="p-6 pt-0 min-h-[420px] space-y-6">
        {usageQuery.isLoading ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <div>
              <Skeleton className="mb-2 h-4 w-28" />
              <Skeleton className="h-8 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </>
        ) : usageQuery.isError ? (
          <div>
            <p className="text-sm text-destructive">Failed to load usage.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => usageQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : usageQuery.data ? (
          <>
            {usageQuery.data.budget ? (
              <div className="rounded-lg border border-border bg-surface text-text-primary">
                <div className="flex flex-col gap-1.5 p-6 pb-2">
                  <h3 className="font-serif text-xl leading-none tracking-tight text-base">Allowance</h3>
                  <p className="text-sm text-text-secondary">
                    {limitSourceLabel(usageQuery.data.budget.limit_source)}
                  </p>
                </div>
                <div className="p-6 pt-0 space-y-2">
                  <Progress
                    value={Math.min(100, usageQuery.data.budget.used_pct * 100)}
                    className={cn(
                      usageQuery.data.budget.used_pct >= 1
                        ? "[&>div]:bg-destructive"
                        : usageQuery.data.budget.used_pct >= 0.8
                          ? "[&>div]:bg-amber-500"
                          : undefined,
                    )}
                  />
                  <p
                    className={cn(
                      "text-sm tabular-nums",
                      usageQuery.data.budget.used_pct >= 1
                        ? "text-destructive"
                        : usageQuery.data.budget.used_pct >= 0.8
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-text-muted",
                    )}
                  >
                    {formatAiUsd(usageQuery.data.budget.used_usd)} /{" "}
                    {formatAiUsd(usageQuery.data.budget.monthly_usd_limit)}
                    {" · "}
                    {formatAiUsd(usageQuery.data.budget.remaining_usd)} remaining
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-sm text-text-muted">Cost</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatAiUsd(usageQuery.data.month_summary.total_cost_usd)}
                </p>
              </div>
              <div>
                <p className="text-sm text-text-muted">Tokens</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatAiTokens(usageQuery.data.month_summary.total_tokens)}
                </p>
              </div>
              <div>
                <p className="text-sm text-text-muted">Requests</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {usageQuery.data.month_summary.request_count.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-sm text-text-muted">Cached tokens</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatAiTokens(usageQuery.data.month_summary.cached_input_tokens)}
                </p>
              </div>
              <div>
                <p className="text-sm text-text-muted">Hit rate</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatCacheHitRate(usageQuery.data.month_summary.cache_hit_rate)}
                </p>
              </div>
              <div>
                <p className="text-sm text-text-muted">Est. savings</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatAiUsd(usageQuery.data.month_summary.cache_savings_usd)}
                </p>
              </div>
            </div>

            {usageQuery.data.trend.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">6-month trend</p>
                <UsageTrendBars trend={usageQuery.data.trend} />
              </div>
            )}

            {usageQuery.data.month_summary.by_feature.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {usageQuery.data.month_summary.by_feature.map((row) => (
                    <tr key={row.feature}>
                      <td>{row.feature}</td>
                      <td className="text-right tabular-nums">
                        {formatAiUsd(row.total_cost_usd)}
                      </td>
                      <td className="text-right tabular-nums">
                        {row.request_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-text-muted">
                No AI usage recorded for this month.
              </p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
