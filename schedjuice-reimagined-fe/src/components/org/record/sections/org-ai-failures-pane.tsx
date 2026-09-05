"use client";
import { Button, Select, Skeleton } from "@/components/primitives";

import { fetchOrgAiUsageFailures } from "@/app/client-api/ai-usage";
import { FailuresOutcomeFilterControl } from "@/components/org/ai/failures-outcome-filter";
import { FailuresTable } from "@/components/org/ai/failures-table";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { getDateISOString } from "@/helpers/date";
import { cn } from "@/lib/utils";
import {
  CapabilityGapFilter,
  FailuresOutcomeFilter,
  FailuresResolutionFilter,
  FailuresSort,
  LikelyCauseFilter,
} from "@/types/ai-usage";
import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsIsoDateTime, parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";

const LIKELY_CAUSE_OPTIONS: { value: LikelyCauseFilter | "all"; label: string }[] = [
  { value: "all", label: "All causes" },
  { value: "tool_descriptions", label: "Tool descriptions" },
  { value: "model_loop", label: "Model loop" },
  { value: "complex_task", label: "Complex task" },
  { value: "unknown", label: "Unknown" },
  { value: "uncategorized", label: "Uncategorized" },
];

const CAPABILITY_GAP_OPTIONS: { value: CapabilityGapFilter | "all"; label: string }[] = [
  { value: "all", label: "All gap types" },
  { value: "missing_tool", label: "Missing tool" },
  { value: "data_not_exposed", label: "Data not exposed" },
  { value: "access_policy", label: "Access policy" },
  { value: "feature_unavailable", label: "Feature off" },
  { value: "unknown", label: "Unknown" },
];

const TOOL_LIMIT_SUMMARY_CARDS: {
  key: LikelyCauseFilter | "total";
  label: string;
  countKey: keyof {
    failure_count: number;
    tool_descriptions: number;
    model_loop: number;
    complex_task: number;
    unknown: number;
    uncategorized: number;
  };
}[] = [
  { key: "total", label: "Failures this month", countKey: "failure_count" },
  { key: "tool_descriptions", label: "Tool descriptions", countKey: "tool_descriptions" },
  { key: "model_loop", label: "Model loop", countKey: "model_loop" },
  { key: "complex_task", label: "Complex task", countKey: "complex_task" },
  { key: "unknown", label: "Unknown", countKey: "unknown" },
  { key: "uncategorized", label: "Uncategorized", countKey: "uncategorized" },
];

const CAPABILITY_GAP_SUMMARY_CARDS: {
  key: CapabilityGapFilter | "total";
  label: string;
  countKey: keyof {
    failure_count: number;
    missing_tool: number;
    data_not_exposed: number;
    access_policy: number;
    feature_unavailable: number;
    unknown: number;
  };
}[] = [
  { key: "total", label: "Gaps this month", countKey: "failure_count" },
  { key: "missing_tool", label: "Missing tool", countKey: "missing_tool" },
  { key: "data_not_exposed", label: "Data not exposed", countKey: "data_not_exposed" },
  { key: "access_policy", label: "Access policy", countKey: "access_policy" },
  { key: "feature_unavailable", label: "Feature off", countKey: "feature_unavailable" },
  { key: "unknown", label: "Unknown", countKey: "unknown" },
];

export function OrgAiFailuresPane({ orgId }: { orgId: string | number }) {
  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [outcome, setOutcome] = useQueryState(
    "outcome",
    parseAsString.withDefault("tool_limit_exceeded"),
  );
  const [likelyCause, setLikelyCause] = useQueryState(
    "likely_cause",
    parseAsString.withDefault(""),
  );
  const [capabilityGap, setCapabilityGap] = useQueryState(
    "capability_gap",
    parseAsString.withDefault(""),
  );
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsString.withDefault("-created_at"),
  );
  const [resolution, setResolution] = useQueryState(
    "resolution",
    parseAsString.withDefault("open"),
  );

  const monthDate = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
    [date],
  );

  const activeOutcome = outcome as FailuresOutcomeFilter;
  const activeLikelyCause = likelyCause as LikelyCauseFilter | "";
  const activeCapabilityGap = capabilityGap as CapabilityGapFilter | "";
  const activeSort = sort as FailuresSort;
  const activeResolution = resolution as FailuresResolutionFilter;

  const failuresQuery = useQuery({
    queryKey: [
      "aiUsageOrgFailures",
      orgId,
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      page,
      activeOutcome,
      activeLikelyCause,
      activeCapabilityGap,
      activeSort,
      activeResolution,
    ],
    enabled: !!orgId,
    queryFn: () =>
      fetchOrgAiUsageFailures(orgId, {
        year: monthDate.getFullYear(),
        month: monthDate.getMonth() + 1,
        page,
        page_size: 25,
        outcome: activeOutcome,
        resolution: activeResolution,
        ...(activeLikelyCause ? { likely_cause: activeLikelyCause } : {}),
        ...(activeCapabilityGap ? { capability_gap: activeCapabilityGap } : {}),
        sort: activeSort,
      }),
  });

  const dateParam = getDateISOString(date);

  const outcomeCounts = useMemo(() => {
    const byOutcome = failuresQuery.data?.summary.by_outcome;
    if (!byOutcome) {
      return { all: 0, tool_limit_exceeded: 0, capability_gap: 0 };
    }
    return {
      all: byOutcome.tool_limit_exceeded + byOutcome.capability_gap,
      tool_limit_exceeded: byOutcome.tool_limit_exceeded,
      capability_gap: byOutcome.capability_gap,
    };
  }, [failuresQuery.data]);

  const applyOutcomeFilter = (value: FailuresOutcomeFilter) => {
    void setOutcome(value);
    void setLikelyCause("");
    void setCapabilityGap("");
    void setPage(1);
  };

  const applyLikelyCauseFilter = (value: LikelyCauseFilter | "all") => {
    void setLikelyCause(value === "all" ? "" : value);
    void setPage(1);
  };

  const applyCapabilityGapFilter = (value: CapabilityGapFilter | "all") => {
    void setCapabilityGap(value === "all" ? "" : value);
    void setPage(1);
  };

  const hasSubFilter = Boolean(activeLikelyCause || activeCapabilityGap);

  const secondaryFilterValue =
    activeOutcome === "capability_gap"
      ? activeCapabilityGap || "all"
      : activeLikelyCause || "all";

  const secondaryOptions =
    activeOutcome === "capability_gap" ? CAPABILITY_GAP_OPTIONS : LIKELY_CAUSE_OPTIONS;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-sm text-text-muted">Month</p>
            <YearMonthSelector date={monthDate} setDate={setDate} />
          </div>
          {hasSubFilter ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void setLikelyCause("");
                void setCapabilityGap("");
                void setPage(1);
              }}
            >
              Clear filter
            </Button>
          ) : null}
        </div>
        <div>
          <p className="mb-2 text-sm text-text-muted">Failure type</p>
          <FailuresOutcomeFilterControl
            value={activeOutcome}
            counts={outcomeCounts}
            onChange={applyOutcomeFilter}
          />
        </div>
        <div>
          <p className="mb-2 text-sm text-text-muted">Status</p>
          <Select
            value={activeResolution}
            onValueChange={(value) => {
              void setResolution(value);
              void setPage(1);
            }}
            items={[
              { value: "open", label: "Open" },
              { value: "resolved", label: "Resolved" },
              { value: "all", label: "All" },
            ]}
            className="w-[200px]"
          />
        </div>
      </div>

      {failuresQuery.isLoading ? (
        <Skeleton className="h-48 w-full" aria-busy="true" />
      ) : failuresQuery.isError ? (
        <div className="rounded-lg border border-border bg-surface text-text-primary">
          <div className="p-6 pt-0 pt-6">
            <p className="text-sm text-destructive">Failed to load AI failures.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => failuresQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : failuresQuery.data ? (
        <>
          {activeOutcome === "all" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div
                className="rounded-lg border border-border bg-surface text-text-primary cursor-pointer transition-colors hover:bg-muted/40 ring-2 ring-primary"
                onClick={() => applyOutcomeFilter("all")}
              >
                <div className="flex flex-col gap-1.5 p-6 pb-2">
                  <h3 className="font-serif text-xl leading-none tracking-tight text-sm font-medium">Total failures</h3>
                </div>
                <div className="p-6 pt-0">
                  <p className="text-2xl font-semibold tabular-nums">
                    {outcomeCounts.all.toLocaleString()}
                  </p>
                </div>
              </div>
              <div
                className="rounded-lg border border-border bg-surface text-text-primary cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => applyOutcomeFilter("tool_limit_exceeded")}
              >
                <div className="flex flex-col gap-1.5 p-6 pb-2">
                  <h3 className="font-serif text-xl leading-none tracking-tight text-sm font-medium">Tool limit</h3>
                </div>
                <div className="p-6 pt-0">
                  <p className="text-2xl font-semibold tabular-nums">
                    {outcomeCounts.tool_limit_exceeded.toLocaleString()}
                  </p>
                </div>
              </div>
              <div
                className="rounded-lg border border-border bg-surface text-text-primary cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => applyOutcomeFilter("capability_gap")}
              >
                <div className="flex flex-col gap-1.5 p-6 pb-2">
                  <h3 className="font-serif text-xl leading-none tracking-tight text-sm font-medium">Capability gap</h3>
                </div>
                <div className="p-6 pt-0">
                  <p className="text-2xl font-semibold tabular-nums">
                    {outcomeCounts.capability_gap.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ) : activeOutcome === "capability_gap" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {CAPABILITY_GAP_SUMMARY_CARDS.map((card) => {
                const byGap = failuresQuery.data.summary.by_capability_gap;
                const count =
                  card.key === "total"
                    ? failuresQuery.data.summary.failure_count
                    : byGap[card.countKey as keyof typeof byGap];
                const isActive =
                  card.key === "total"
                    ? !activeCapabilityGap
                    : activeCapabilityGap === card.key;

                return (
                  <div
                    key={card.key}
                    className={cn(
                      "rounded-lg border border-border bg-surface text-text-primary",
                      "cursor-pointer transition-colors hover:bg-muted/40",
                      isActive && "ring-2 ring-primary",
                    )}
                    onClick={() =>
                      card.key === "total"
                        ? applyCapabilityGapFilter("all")
                        : applyCapabilityGapFilter(card.key as CapabilityGapFilter)
                    }
                  >
                    <div className="flex flex-col gap-1.5 p-6 pb-2">
                      <h3 className="font-serif text-xl leading-none tracking-tight text-sm font-medium">{card.label}</h3>
                    </div>
                    <div className="p-6 pt-0">
                      <p className="text-2xl font-semibold tabular-nums">
                        {count.toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {TOOL_LIMIT_SUMMARY_CARDS.map((card) => {
                const byCause = failuresQuery.data.summary.by_likely_cause;
                const count =
                  card.key === "total"
                    ? failuresQuery.data.summary.failure_count
                    : byCause[card.countKey as keyof typeof byCause];
                const isActive =
                  card.key === "total" ? !activeLikelyCause : activeLikelyCause === card.key;

                return (
                  <div
                    key={card.key}
                    className={cn(
                      "rounded-lg border border-border bg-surface text-text-primary",
                      "cursor-pointer transition-colors hover:bg-muted/40",
                      isActive && "ring-2 ring-primary",
                    )}
                    onClick={() =>
                      card.key === "total"
                        ? applyLikelyCauseFilter("all")
                        : applyLikelyCauseFilter(card.key as LikelyCauseFilter)
                    }
                  >
                    <div className="flex flex-col gap-1.5 p-6 pb-2">
                      <h3 className="font-serif text-xl leading-none tracking-tight text-sm font-medium">{card.label}</h3>
                    </div>
                    <div className="p-6 pt-0">
                      <p className="text-2xl font-semibold tabular-nums">
                        {count.toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-lg border border-border bg-surface text-text-primary">
            <div className="flex flex-col gap-1.5 p-6 flex flex-row flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-serif text-xl leading-none tracking-tight text-base">AI failures</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tool limits and in-scope requests the assistant couldn&apos;t fully fulfill.
                </p>
              </div>
              {activeOutcome !== "all" ? (
                <Select
                  value={secondaryFilterValue}
                  onValueChange={(value) => {
                    if (activeOutcome === "capability_gap") {
                      applyCapabilityGapFilter(value as CapabilityGapFilter | "all");
                    } else {
                      applyLikelyCauseFilter(value as LikelyCauseFilter | "all");
                    }
                  }}
                  items={secondaryOptions}
                  placeholder={
                    activeOutcome === "capability_gap"
                      ? "Filter by gap type"
                      : "Filter by cause"
                  }
                  className="w-[200px]"
                />
              ) : null}
            </div>
            <div className="p-6 pt-0 min-w-0">
              <FailuresTable
                items={failuresQuery.data.items}
                showOrgColumn={false}
                dateParam={dateParam}
                page={failuresQuery.data.page}
                pageSize={failuresQuery.data.page_size}
                totalCount={failuresQuery.data.total_count}
                onPageChange={setPage}
                sort={activeSort}
                onSortChange={(next) => {
                  void setSort(next);
                  void setPage(1);
                }}
                outcomeFilter={activeOutcome}
                resolutionFilter={activeResolution}
                orgId={orgId}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
