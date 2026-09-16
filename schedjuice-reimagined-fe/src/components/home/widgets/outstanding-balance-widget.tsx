"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { searchEntities } from "@/app/client-api/utils";
import { formatMoney } from "@/helpers/money";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { operatorEnum } from "@/types/api";
import { UserPaymentStatus } from "@/types/finance";
import { DashboardCard } from "../dashboard-card";

export default function OutstandingBalanceWidget() {
  const currencySymbol = useTenantCurrencySymbol();
  const { user, isLoading: userLoading } = useUser();
  const userId = user?.id != null ? String(user.id) : "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["widget-outstanding-balance", userId],
    queryFn: () =>
      searchEntities(
        "user-payments",
        {
          size: -1,
          expand: ["course"],
        },
        {
          filter_params: [
            {
              field_name: "status",
              operator: operatorEnum.exact,
              value: UserPaymentStatus.pending_payment,
            },
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: userId,
            },
          ],
        },
      ),
    enabled: isValidApiEntityIdParam(userId),
  });

  const payments = (data?.data?.data ?? []) as { invoiced_amount?: string }[];
  const totalOwed = useMemo(
    () =>
      payments.reduce(
        (sum, row) => sum + parseFloat(String(row.invoiced_amount ?? 0)),
        0,
      ),
    [payments],
  );

  const loading = userLoading || isLoading;
  const error = isError ? "Could not load payments." : undefined;
  const empty = !loading && !error && payments.length === 0;

  return (
    <DashboardCard
      title="Outstanding balance"
      span="sm"
      loading={loading}
      empty={empty}
      error={error}
    >
      <div className="space-y-3">
        <p className="text-sm text-text-muted">
          {payments.length === 1 ? "1 invoice" : `${payments.length} invoices`}
        </p>
        <p className="font-mono text-2xl font-medium tracking-tight">
          {formatMoney(totalOwed, currencySymbol)}
        </p>
        <Link
          href="/finances/make-payment"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          Make payment
        </Link>
      </div>
    </DashboardCard>
  );
}
