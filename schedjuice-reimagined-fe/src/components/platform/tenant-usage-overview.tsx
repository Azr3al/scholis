"use client";

import { fetchOrgAiUsage } from "@/app/client-api/ai-usage";
import { fetchOrgBilling } from "@/app/client-api/billing";
import { Button, Skeleton } from "@/components/primitives";
import { getDateISOString } from "@/helpers/date";
import { permissionsFor } from "@/helpers/authorization";
import { formatMoney } from "@/helpers/money";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { formatAiTokens, formatMonthLabel } from "@/types/ai-usage";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo } from "react";

function UsageMetricCard({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: ReactNode;
  isLoading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface text-text-primary">
      <div className="flex flex-col gap-1.5 p-6">
        <h3 className="font-serif text-base leading-none tracking-tight">{label}</h3>
      </div>
      <div className="p-6 pt-0">
        {isLoading ? (
          <Skeleton className="h-8 w-24" aria-busy="true" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        )}
      </div>
    </div>
  );
}

function QueryError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function TenantUsageOverview({ tenantId }: { tenantId: number }) {
  const { user } = useUser();
  const perms = permissionsFor(user);
  const canViewBilling = perms.can("billing.manage");
  const canViewAi = perms.can("ai.usage.view");
  const currencySymbol = useTenantCurrencySymbol();

  const now = useMemo(() => new Date(), []);
  const monthParams = useMemo(
    () => ({ year: now.getFullYear(), month: now.getMonth() + 1 }),
    [now],
  );
  const dateParam = getDateISOString(now);
  const monthLabel = formatMonthLabel(monthParams.year, monthParams.month);

  const billingQuery = useQuery({
    queryKey: ["tenantUsageBilling", tenantId, dateParam],
    queryFn: () => fetchOrgBilling(tenantId, dateParam),
    enabled: canViewBilling && !!tenantId,
  });

  const aiQuery = useQuery({
    queryKey: ["tenantUsageAi", tenantId, monthParams.year, monthParams.month],
    queryFn: () => fetchOrgAiUsage(tenantId, monthParams),
    enabled: canViewAi && !!tenantId,
  });

  const latestActiveUsers = useMemo(() => {
    const rows = billingQuery.data?.data ?? [];
    if (rows.length === 0) return null;
    return rows[rows.length - 1]?.active_user_count ?? null;
  }, [billingQuery.data]);

  return (
    <div className="space-y-10">
      {canViewBilling ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Schedjuice</h2>
            <p className="text-sm text-text-muted">{monthLabel}</p>
          </div>
          {billingQuery.isError || billingQuery.data?.isError ? (
            <QueryError
              message="Failed to load Schedjuice usage."
              onRetry={() => billingQuery.refetch()}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <UsageMetricCard
                label="Active users"
                isLoading={billingQuery.isLoading}
                value={
                  latestActiveUsers == null
                    ? "—"
                    : latestActiveUsers.toLocaleString()
                }
              />
              <UsageMetricCard
                label="Monthly total"
                isLoading={billingQuery.isLoading}
                value={
                  billingQuery.data
                    ? formatMoney(
                        billingQuery.data.total_payment ?? 0,
                        currencySymbol,
                      )
                    : "—"
                }
              />
            </div>
          )}
        </section>
      ) : null}

      {canViewAi ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">AI</h2>
            <p className="text-sm text-text-muted">{monthLabel}</p>
          </div>
          {aiQuery.isError ? (
            <QueryError
              message="Failed to load AI usage."
              onRetry={() => aiQuery.refetch()}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <UsageMetricCard
                label="Tokens"
                isLoading={aiQuery.isLoading}
                value={
                  aiQuery.data
                    ? formatAiTokens(aiQuery.data.month_summary.total_tokens)
                    : "—"
                }
              />
              <UsageMetricCard
                label="Requests"
                isLoading={aiQuery.isLoading}
                value={
                  aiQuery.data
                    ? aiQuery.data.month_summary.request_count.toLocaleString()
                    : "—"
                }
              />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
