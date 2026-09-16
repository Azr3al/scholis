"use client";
import { Button, Select, Skeleton } from "@/components/primitives";

import {
  fetchOrgAiUsageAnalytics,
  fetchPlatformAiUsageAnalytics,
} from "@/app/client-api/ai-usage";
import { DailyActivityChart } from "@/components/org/ai/charts/daily-activity-chart";
import { MonthlyTrendChart } from "@/components/org/ai/charts/monthly-trend-chart";
import { OutcomeMixChart } from "@/components/org/ai/charts/outcome-mix-chart";
import { TopUsersChart } from "@/components/org/ai/charts/top-users-chart";
import type { OrgRecordMode } from "@/config/org-record-sections";
import type { AiAnalyticsFeature } from "@/types/ai-usage-analytics";
import type { RequestsOutcomeFilter } from "@/types/ai-usage";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

const FEATURE_OPTIONS: { value: AiAnalyticsFeature; label: string }[] = [
  { value: "telegram_query", label: "Telegram" },
  { value: "ai_query", label: "Web" },
  { value: "all", label: "All channels" },
];

export type AiAnalyticsSectionProps = {
  orgId: string | number;
  mode: OrgRecordMode;
  monthDate: Date;
  feature: AiAnalyticsFeature;
  onFeatureChange: (feature: AiAnalyticsFeature) => void;
  showTenantFilter: boolean;
  tenantId: number | null;
  onTenantChange: (tenantId: number | null) => void;
  tenantOptions: { id: number; name: string }[];
  onOutcomeSelect?: (outcome: RequestsOutcomeFilter) => void;
};

export function AiAnalyticsSection({
  orgId,
  monthDate,
  feature,
  onFeatureChange,
  showTenantFilter,
  tenantId,
  onTenantChange,
  tenantOptions,
  onOutcomeSelect,
}: AiAnalyticsSectionProps) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth() + 1;

  const analyticsQuery = useQuery({
    queryKey: [
      "aiUsageAnalytics",
      showTenantFilter ? "platform" : "org",
      showTenantFilter ? tenantId : orgId,
      year,
      month,
      feature,
    ],
    queryFn: () => {
      const params = { year, month, feature };
      if (showTenantFilter) {
        return fetchPlatformAiUsageAnalytics({
          ...params,
          tenant_id: tenantId,
        });
      }
      return fetchOrgAiUsageAnalytics(orgId, params);
    },
  });

  const emptyOutcomeTotals = useMemo(
    () => ({
      success: 0,
      capability_gap: 0,
      tool_limit_exceeded: 0,
      error: 0,
      blocked: 0,
      rate_limited: 0,
    }),
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-1 text-sm text-text-muted">Channel</p>
          <Select
            value={feature}
            onValueChange={(value) => onFeatureChange(value as AiAnalyticsFeature)}
            items={FEATURE_OPTIONS}
            placeholder="Channel"
            className="w-[160px]"
          />
        </div>
        {showTenantFilter ? (
          <div>
            <p className="mb-1 text-sm text-text-muted">Organization</p>
            <Select
              value={tenantId == null ? "all" : String(tenantId)}
              onValueChange={(value) =>
                onTenantChange(value === "all" ? null : Number(value))
              }
              items={[
                { value: "all", label: "All organizations" },
                ...tenantOptions.map((org) => ({
                  value: String(org.id),
                  label: org.name,
                })),
              ]}
              placeholder="Organization"
              className="w-[220px]"
            />
          </div>
        ) : null}
      </div>

      {analyticsQuery.isLoading ? (
        <Skeleton className="h-[640px] w-full" aria-busy="true" />
      ) : analyticsQuery.isError ? (
        <div className="rounded-lg border border-border bg-surface text-text-primary">
          <div className="p-6 pt-0 pt-6">
            <p className="text-sm text-destructive">Failed to load analytics charts.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => analyticsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : analyticsQuery.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface text-text-primary">
            <div className="flex flex-col gap-1.5 p-6 pb-2">
              <h3 className="font-serif text-xl leading-none tracking-tight text-base">Daily activity</h3>
              <p className="text-sm text-text-secondary">Requests per day with cost overlay</p>
            </div>
            <div className="p-6 pt-0">
              <DailyActivityChart daily={analyticsQuery.data.daily} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface text-text-primary">
            <div className="flex flex-col gap-1.5 p-6 pb-2">
              <h3 className="font-serif text-xl leading-none tracking-tight text-base">Outcome mix</h3>
              <p className="text-sm text-text-secondary">
                {onOutcomeSelect
                  ? "Click a segment to filter the table below"
                  : "Request outcomes for the selected month"}
              </p>
            </div>
            <div className="p-6 pt-0">
              <OutcomeMixChart
                totals={analyticsQuery.data.outcome_totals ?? emptyOutcomeTotals}
                onOutcomeSelect={onOutcomeSelect}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface text-text-primary">
            <div className="flex flex-col gap-1.5 p-6 pb-2">
              <h3 className="font-serif text-xl leading-none tracking-tight text-base">6-month trend</h3>
              <p className="text-sm text-text-secondary">Requests, success rate, and cost</p>
            </div>
            <div className="p-6 pt-0">
              <MonthlyTrendChart trend={analyticsQuery.data.monthly_trend} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface text-text-primary">
            <div className="flex flex-col gap-1.5 p-6 pb-2">
              <h3 className="font-serif text-xl leading-none tracking-tight text-base">Top users</h3>
              <p className="text-sm text-text-secondary">Most active users this month</p>
            </div>
            <div className="p-6 pt-0">
              <TopUsersChart users={analyticsQuery.data.top_users} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
