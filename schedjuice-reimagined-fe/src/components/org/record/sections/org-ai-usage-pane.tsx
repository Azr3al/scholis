"use client";
import { Button, Skeleton } from "@/components/primitives";

import { fetchOrgAiUsage, fetchOrgAiUsageUsers } from "@/app/client-api/ai-usage";
import {
  AiAnalyticsSection,
  type AiAnalyticsSectionProps,
} from "@/components/org/ai/ai-analytics-section";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import type { OrgRecordMode } from "@/config/org-record-sections";
import {
  formatAiTokens,
  formatAiUsd,
  formatCacheHitRate,
  formatMonthLabel,
} from "@/types/ai-usage";
import { useQuery } from "@tanstack/react-query";
import { parseAsIsoDateTime, useQueryState } from "nuqs";
import { useMemo } from "react";

function userLimitStatusBadge(status: "ok" | "near_limit" | "at_limit" | undefined) {
  if (status === "at_limit") {
    return <span className="inline-flex items-center rounded-md border border-transparent bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">At limit</span>;
  }
  if (status === "near_limit") {
    return (
      <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
        Near limit
      </span>
    );
  }
  return <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary">OK</span>;
}

export function OrgAiUsagePane({
  orgId,
  analytics,
}: {
  orgId: string | number;
  mode: OrgRecordMode;
  analytics: AiAnalyticsSectionProps;
}) {
  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );

  const monthDate = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
    [date],
  );

  const usageOrgId =
    analytics.showTenantFilter && analytics.tenantId != null
      ? analytics.tenantId
      : orgId;
  const usageEnabled =
    !!orgId && !(analytics.showTenantFilter && analytics.tenantId == null);
  const monthParams = {
    year: monthDate.getFullYear(),
    month: monthDate.getMonth() + 1,
  };

  const summaryQuery = useQuery({
    queryKey: ["aiUsageOrgSummary", usageOrgId, monthParams.year, monthParams.month],
    enabled: usageEnabled,
    queryFn: () => fetchOrgAiUsage(usageOrgId, monthParams),
  });

  const usersQuery = useQuery({
    queryKey: ["aiUsageOrgUsers", usageOrgId, monthParams.year, monthParams.month],
    enabled: usageEnabled,
    queryFn: () => fetchOrgAiUsageUsers(usageOrgId, monthParams),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-text-muted">Month</p>
          <YearMonthSelector date={monthDate} setDate={setDate} />
        </div>
      </div>

      <AiAnalyticsSection {...analytics} />

      {analytics.showTenantFilter && analytics.tenantId == null ? (
        <p className="text-sm text-muted-foreground">
          Select an organization to view detailed usage breakdown, model split, and top
          spenders.
        </p>
      ) : null}

      {usageEnabled ? (
        <>
          {summaryQuery.isLoading ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 w-full" aria-busy="true" />
                ))}
              </div>
              <Skeleton className="h-40 w-full" aria-busy="true" />
            </div>
          ) : summaryQuery.isError ? (
            <div className="rounded-lg border border-border bg-surface text-text-primary">
              <div className="p-6 pt-0 pt-6">
                <p className="text-sm text-destructive">Failed to load AI usage summary.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => summaryQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : summaryQuery.data ? (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-surface text-text-primary">
                  <div className="flex flex-col gap-1.5 p-6">
                    <h3 className="font-serif text-xl leading-none tracking-tight text-base">Total cost</h3>
                  </div>
                  <div className="p-6 pt-0">
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatAiUsd(summaryQuery.data.month_summary.total_cost_usd)}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface text-text-primary">
                  <div className="flex flex-col gap-1.5 p-6">
                    <h3 className="font-serif text-xl leading-none tracking-tight text-base">Total tokens</h3>
                  </div>
                  <div className="p-6 pt-0">
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatAiTokens(summaryQuery.data.month_summary.total_tokens)}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface text-text-primary">
                  <div className="flex flex-col gap-1.5 p-6">
                    <h3 className="font-serif text-xl leading-none tracking-tight text-base">Requests</h3>
                  </div>
                  <div className="p-6 pt-0">
                    <p className="text-2xl font-semibold tabular-nums">
                      {summaryQuery.data.month_summary.request_count.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-surface text-text-primary">
                  <div className="flex flex-col gap-1.5 p-6">
                    <h3 className="font-serif text-xl leading-none tracking-tight text-base">Cached tokens</h3>
                  </div>
                  <div className="p-6 pt-0">
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatAiTokens(summaryQuery.data.month_summary.cached_input_tokens)}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface text-text-primary">
                  <div className="flex flex-col gap-1.5 p-6">
                    <h3 className="font-serif text-xl leading-none tracking-tight text-base">Cache hit rate</h3>
                  </div>
                  <div className="p-6 pt-0">
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatCacheHitRate(summaryQuery.data.month_summary.cache_hit_rate)}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface text-text-primary">
                  <div className="flex flex-col gap-1.5 p-6">
                    <h3 className="font-serif text-xl leading-none tracking-tight text-base">Est. savings</h3>
                  </div>
                  <div className="p-6 pt-0">
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatAiUsd(summaryQuery.data.month_summary.cache_savings_usd)}
                    </p>
                  </div>
                </div>
              </div>

              {summaryQuery.data.month_summary.by_model.length > 0 ? (
                <div className="rounded-lg border border-border bg-surface text-text-primary">
                  <div className="flex flex-col gap-1.5 p-6">
                    <h3 className="font-serif text-xl leading-none tracking-tight">By model</h3>
                    <p className="text-sm text-text-secondary">
                      {formatMonthLabel(monthParams.year, monthParams.month)}
                    </p>
                  </div>
                  <div className="p-6 pt-0">
                    <div className="rounded-md border">
                      <table>
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th className="text-right">Cost</th>
                            <th className="text-right">Tokens</th>
                            <th className="text-right">Cached</th>
                            <th className="text-right">Hit rate</th>
                            <th className="text-right">Savings</th>
                            <th className="text-right">Requests</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summaryQuery.data.month_summary.by_model.map((row) => (
                            <tr key={row.model}>
                              <td>{row.model}</td>
                              <td className="text-right tabular-nums">
                                {formatAiUsd(row.total_cost_usd)}
                              </td>
                              <td className="text-right tabular-nums">
                                {formatAiTokens(row.total_tokens)}
                              </td>
                              <td className="text-right tabular-nums">
                                {formatAiTokens(row.cached_input_tokens)}
                              </td>
                              <td className="text-right tabular-nums">
                                {formatCacheHitRate(row.cache_hit_rate)}
                              </td>
                              <td className="text-right tabular-nums">
                                {formatAiUsd(row.cache_savings_usd)}
                              </td>
                              <td className="text-right tabular-nums">
                                {row.request_count.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="rounded-lg border border-border bg-surface text-text-primary">
            <div className="flex flex-col gap-1.5 p-6">
              <h3 className="font-serif text-xl leading-none tracking-tight">Top spenders</h3>
              <p className="text-sm text-text-secondary">
                Users ranked by billed AI cost for{" "}
                {formatMonthLabel(monthParams.year, monthParams.month)}
              </p>
            </div>
            <div className="p-6 pt-0">
              {usersQuery.isLoading ? (
                <Skeleton className="h-48 w-full" aria-busy="true" />
              ) : usersQuery.isError ? (
                <>
                  <p className="text-sm text-destructive">Failed to load top spenders.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() => usersQuery.refetch()}
                  >
                    Retry
                  </Button>
                </>
              ) : usersQuery.data?.users.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No user-level usage recorded for this month.
                </p>
              ) : usersQuery.data ? (
                <div className="rounded-md border">
                  <table>
                    <thead>
                      <tr>
                        <th className="w-12">#</th>
                        <th>User</th>
                        <th>Email</th>
                        <th className="text-right">Cost</th>
                        <th className="text-right">Limit</th>
                        <th className="text-right">Used %</th>
                        <th>Status</th>
                        <th className="text-right">Tokens</th>
                        <th className="text-right">Cached</th>
                        <th className="text-right">Hit rate</th>
                        <th className="text-right">Requests</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersQuery.data.users.map((row, index) => (
                        <tr key={`${row.user_id ?? "unknown"}-${index}`}>
                          <td className="tabular-nums">{index + 1}</td>
                          <td>{row.display_name}</td>
                          <td className="text-muted-foreground">
                            {row.email || "—"}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatAiUsd(row.total_cost_usd)}
                          </td>
                          <td className="text-right tabular-nums">
                            {row.monthly_usd_limit
                              ? formatAiUsd(row.monthly_usd_limit)
                              : "—"}
                          </td>
                          <td className="text-right tabular-nums">
                            {row.used_pct != null
                              ? `${Math.round(row.used_pct * 100)}%`
                              : "—"}
                          </td>
                          <td>
                            {userLimitStatusBadge(row.limit_status)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatAiTokens(row.total_tokens)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatAiTokens(row.cached_input_tokens)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatCacheHitRate(row.cache_hit_rate)}
                          </td>
                          <td className="text-right tabular-nums">
                            {row.request_count.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
