"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { makePostRequest } from "@/app/client-api/utils";
import { formatMoney } from "@/helpers/money";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { PayrollCalculationStrategy } from "@/types/organization";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useMemo } from "react";
import { DashboardCard } from "../dashboard-card";

export default function MyEarningsWidget() {
  const { user } = useUser();
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const now = useMemo(() => new Date(), []);

  const payrollEndpoint =
    tenant?.payroll_calculation_strategy ===
    PayrollCalculationStrategy.session_based
      ? "payroll/session-based"
      : "payroll/trphillips";

  const payrollQuery = useQuery({
    queryKey: [
      "widget-my-earnings",
      payrollEndpoint,
      user?.id,
      now.getFullYear(),
      now.getMonth(),
    ],
    queryFn: async () => {
      const res = await makePostRequest(payrollEndpoint, {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        user_id: user?.id,
      });
      return res.data;
    },
    enabled: !!user?.id,
  });

  const earnings = payrollQuery.data?.data?.aggregate?.total_earnings;
  const formatted =
    earnings !== undefined && earnings !== null
      ? formatMoney(earnings, currencySymbol)
      : null;

  return (
    <DashboardCard
      title="My earnings"
      span="sm"
      loading={!user || payrollQuery.isLoading}
      empty={!payrollQuery.isLoading && !payrollQuery.isError && !formatted}
      error={
        payrollQuery.isError ? "Could not load payroll data." : undefined
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs text-text-muted">
            {format(now, "MMMM yyyy")}
          </p>
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {formatted ?? "—"}
          </p>
        </div>
        <Link
          href="/finances/payroll"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          View payroll
        </Link>
      </div>
    </DashboardCard>
  );
}
