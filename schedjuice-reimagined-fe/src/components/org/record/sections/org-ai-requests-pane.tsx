"use client";
import { Select, Skeleton } from "@/components/primitives";

import {
  fetchOrgAiUsageRequests,
  fetchPlatformAiUsageRequests,
} from "@/app/client-api/ai-usage";
import {
  AiAnalyticsSection,
  type AiAnalyticsSectionProps,
} from "@/components/org/ai/ai-analytics-section";
import { RequestsTable } from "@/components/org/ai/requests-table";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { RequestsOutcomeFilter, RequestsSort } from "@/types/ai-usage";
import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsIsoDateTime, parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";

const OUTCOME_OPTIONS: { value: RequestsOutcomeFilter; label: string }[] = [
  { value: "all", label: "All outcomes" },
  { value: "success", label: "Success" },
  { value: "tool_limit_exceeded", label: "Tool limit" },
  { value: "capability_gap", label: "Capability gap" },
  { value: "error", label: "Error" },
  { value: "blocked", label: "Blocked" },
  { value: "rate_limited", label: "Rate limited" },
];

export function OrgAiRequestsPane({
  orgId,
  analytics,
}: {
  orgId: string | number;
  analytics: AiAnalyticsSectionProps;
}) {
  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [outcome, setOutcome] = useQueryState(
    "outcome",
    parseAsString.withDefault("all"),
  );
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsString.withDefault("-created_at"),
  );

  const monthDate = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
    [date],
  );

  const activeOutcome = outcome as RequestsOutcomeFilter;
  const activeSort = sort as RequestsSort;
  const { feature: activeFeature, showTenantFilter, tenantId } = analytics;

  const requestOrgId =
    showTenantFilter && tenantId != null ? tenantId : orgId;
  const usePlatformRequests = showTenantFilter && tenantId == null;

  const requestsQuery = useQuery({
    queryKey: [
      "aiUsageOrgRequests",
      usePlatformRequests ? "platform" : requestOrgId,
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      page,
      activeOutcome,
      activeFeature,
      activeSort,
    ],
    enabled: usePlatformRequests || !!requestOrgId,
    queryFn: () => {
      const params = {
        year: monthDate.getFullYear(),
        month: monthDate.getMonth() + 1,
        page,
        page_size: 25,
        outcome: activeOutcome,
        feature: activeFeature,
        sort: activeSort,
      };
      if (usePlatformRequests) {
        return fetchPlatformAiUsageRequests(params);
      }
      return fetchOrgAiUsageRequests(requestOrgId, params);
    },
  });

  const summary = requestsQuery.data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <YearMonthSelector date={monthDate} setDate={setDate} />
        <Select
          value={activeOutcome}
          onValueChange={(value) => {
            void setOutcome(value);
            void setPage(1);
          }}
          items={OUTCOME_OPTIONS}
          placeholder="Outcome"
          className="w-[180px]"
        />
      </div>

      <AiAnalyticsSection
        {...analytics}
        onOutcomeSelect={(value) => {
          void setOutcome(value);
          void setPage(1);
        }}
      />

      {requestsQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : requestsQuery.isError ? (
        <p className="text-sm text-destructive">
          {requestsQuery.error instanceof Error
            ? requestsQuery.error.message
            : "Failed to load requests"}
        </p>
      ) : (
        <>
          {summary ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-surface text-text-primary">
                <div className="flex flex-col gap-1.5 p-6 pb-2">
                  <h3 className="font-serif text-xl leading-none tracking-tight text-sm font-medium text-muted-foreground">
                    Requests this month
                  </h3>
                </div>
                <div className="p-6 pt-0">
                  <p className="text-2xl font-semibold tabular-nums">
                    {summary.request_count}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface text-text-primary">
                <div className="flex flex-col gap-1.5 p-6 pb-2">
                  <h3 className="font-serif text-xl leading-none tracking-tight text-sm font-medium text-muted-foreground">
                    Successful
                  </h3>
                </div>
                <div className="p-6 pt-0">
                  <p className="text-2xl font-semibold tabular-nums">
                    {summary.by_outcome.success}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface text-text-primary">
                <div className="flex flex-col gap-1.5 p-6 pb-2">
                  <h3 className="font-serif text-xl leading-none tracking-tight text-sm font-medium text-muted-foreground">
                    Tool limit
                  </h3>
                </div>
                <div className="p-6 pt-0">
                  <p className="text-2xl font-semibold tabular-nums">
                    {summary.by_outcome.tool_limit_exceeded}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface text-text-primary">
                <div className="flex flex-col gap-1.5 p-6 pb-2">
                  <h3 className="font-serif text-xl leading-none tracking-tight text-sm font-medium text-muted-foreground">
                    Blocked / limited
                  </h3>
                </div>
                <div className="p-6 pt-0">
                  <p className="text-2xl font-semibold tabular-nums">
                    {summary.by_outcome.blocked + summary.by_outcome.rate_limited}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <RequestsTable
            items={requestsQuery.data?.items ?? []}
            page={page}
            pageSize={requestsQuery.data?.page_size ?? 25}
            totalCount={requestsQuery.data?.total_count ?? 0}
            onPageChange={(next) => void setPage(next)}
            sort={activeSort}
            onSortChange={(next) => void setSort(next)}
          />
        </>
      )}
    </div>
  );
}
