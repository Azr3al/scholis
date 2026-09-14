"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";

import { makePostRequest } from "@/app/client-api/utils";
import { useHomeMotionVariants } from "@/components/home/home-motion";
import { Skeleton } from "@/components/primitives/skeleton";
import { permissionsFor } from "@/helpers/authorization";
import { formatPayrollMoney } from "@/lib/payroll/format";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { PayrollCalculationStrategy } from "@/types/organization";

function EarningsSkeleton() {
  return (
    <section
      className="mt-10 space-y-2 border-t border-rule pt-8"
      aria-busy="true"
      aria-label="Loading earnings"
    >
      <Skeleton className="h-3 w-24" />
      <div className="flex items-baseline justify-between gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
    </section>
  );
}

export function EarningsStrip() {
  const { crossfade } = useHomeMotionVariants();
  const { user, isOnlyTeacher } = useUser();
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const now = useMemo(() => new Date(), []);

  const enabled =
    isOnlyTeacher &&
    !!tenant?.is_payroll_calculation_enabled &&
    !!user &&
    permissionsFor(user).can("payroll.view");

  const isSessionBased =
    tenant?.payroll_calculation_strategy ===
    PayrollCalculationStrategy.session_based;
  const payrollEndpoint = isSessionBased
    ? "payroll/session-based"
    : "payroll/trphillips";

  const payrollQuery = useQuery({
    queryKey: [
      "home-earnings",
      payrollEndpoint,
      user?.id,
      now.getFullYear(),
      now.getMonth(),
    ],
    queryFn: () =>
      makePostRequest(payrollEndpoint, {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        user_id: user!.id,
      }),
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return null;

  const aggregate = payrollQuery.data?.data?.data?.aggregate;
  const total = aggregate?.total_earnings;
  const monthLabel = format(now, "MMMM yyyy");

  return (
    <AnimatePresence mode="wait" initial={false}>
      {payrollQuery.isLoading ? (
        <motion.div
          key="earnings-loading"
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <EarningsSkeleton />
        </motion.div>
      ) : payrollQuery.isError || total == null ? null : (
        <motion.section
          key="earnings-ready"
          className="mt-10 space-y-2 border-t border-rule pt-8"
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <div className="text-xs text-text-muted">{monthLabel}</div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-mono text-2xl tabular-nums text-text-primary">
              {formatPayrollMoney(total, currencySymbol)}
            </span>
            <Link
              href="/finances/payroll"
              className="text-sm text-text-muted hover:text-text-primary"
            >
              View payroll →
            </Link>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
