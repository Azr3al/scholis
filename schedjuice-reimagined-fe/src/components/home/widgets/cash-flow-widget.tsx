"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { makePostRequest } from "@/app/client-api/utils";
import { formatDecimalString } from "@/helpers/money";
import { cn } from "@/lib/utils";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import type {
  SchoolOverviewApiEnvelope,
  SchoolOverviewPayload,
} from "@/types/finance/cash-flow";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useMemo } from "react";
import { DashboardCard } from "../dashboard-card";

function getSchoolOverviewPayload(
  res: SchoolOverviewApiEnvelope | undefined,
): SchoolOverviewPayload | undefined {
  if (!res) return undefined;
  if (res.courses != null && res.grand_aggregate != null) {
    return {
      courses: res.courses,
      grand_aggregate: res.grand_aggregate,
      is_ongoing_month: res.is_ongoing_month,
    };
  }
  const nested = res.data;
  if (nested?.courses != null && nested?.grand_aggregate != null) {
    return {
      ...nested,
      is_ongoing_month: nested.is_ongoing_month ?? res.is_ongoing_month,
    };
  }
  return undefined;
}

export default function CashFlowWidget() {
  const { user } = useUser();
  const currencySymbol = useTenantCurrencySymbol();
  const now = useMemo(() => new Date(), []);

  const overviewQuery = useQuery({
    queryKey: [
      "widget-cash-flow",
      now.getFullYear(),
      now.getMonth() + 1,
    ],
    queryFn: async () => {
      const res = await makePostRequest(
        "cash-flow/trphillips/school-overview",
        {
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      );
      return getSchoolOverviewPayload(res.data as SchoolOverviewApiEnvelope);
    },
    enabled: !!user,
  });

  const aggregate = overviewQuery.data?.grand_aggregate;
  const hasData =
    aggregate != null &&
    (aggregate.total_profit != null || aggregate.total_income != null);

  return (
    <DashboardCard
      title="Cash flow"
      span="lg"
      loading={!user || overviewQuery.isLoading}
      empty={!overviewQuery.isLoading && !overviewQuery.isError && !hasData}
      error={overviewQuery.isError ? "Could not load cash flow." : undefined}
    >
      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          {format(now, "MMMM yyyy")}
          {overviewQuery.data?.is_ongoing_month ? " · in progress" : ""}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-text-muted">Total income</p>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatDecimalString(aggregate?.total_income, currencySymbol)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Total profit</p>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatDecimalString(aggregate?.total_profit, currencySymbol)}
            </p>
          </div>
        </div>
        <Link
          href="/finances/school-overview"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          School overview
        </Link>
      </div>
    </DashboardCard>
  );
}
