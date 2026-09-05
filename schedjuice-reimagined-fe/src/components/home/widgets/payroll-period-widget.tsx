"use client";

import { DashboardCard } from "@/components/home/dashboard-card";
import { useTenant } from "@/hooks/useTenant";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowRight } from "iconoir-react";
import Link from "next/link";
import { useMemo } from "react";

export default function PayrollPeriodWidget() {
  const { tenant, isLoading } = useTenant();

  const periodLabel = useMemo(() => {
    if (!tenant?.timezone) return null;
    return formatInTimeZone(new Date(), tenant.timezone, "MMMM yyyy");
  }, [tenant?.timezone]);

  const payrollHref = useMemo(() => {
    if (tenant?.is_payroll_calculation_enabled) return "/finances/payroll";
    if (tenant?.is_microsoft_on) return "/finances/microsoft-payroll";
    return "/finances/payroll";
  }, [tenant?.is_microsoft_on, tenant?.is_payroll_calculation_enabled]);

  const ctaLabel = tenant?.is_microsoft_on && !tenant?.is_payroll_calculation_enabled
    ? "Open Microsoft payroll"
    : "Open payroll";

  return (
    <DashboardCard
      title="Payroll period"
      span="sm"
      loading={isLoading}
      empty={!isLoading && !periodLabel}
    >
      <div className="space-y-4">
        <p className="text-2xl font-semibold tracking-tight font-mono tabular-nums">
          {periodLabel}
        </p>
        <p className="text-sm text-text-muted">
          Current payroll month
        </p>
        <Link
          href={payrollHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {ctaLabel}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </DashboardCard>
  );
}
