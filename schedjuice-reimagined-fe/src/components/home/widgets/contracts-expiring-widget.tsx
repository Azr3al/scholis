"use client";

import { searchEntities } from "@/app/client-api/utils";
import { DashboardCard } from "@/components/home/dashboard-card";
import {
  addCalendarDaysToTenantYmd,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useTenant } from "@/hooks/useTenant";
import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "iconoir-react";
import Link from "next/link";

export default function ContractsExpiringWidget() {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const timezone = tenant?.timezone ?? "UTC";
  const todayYmd = getTenantTodayYmd(timezone);
  const in30DaysYmd = addCalendarDaysToTenantYmd(todayYmd, timezone, 30);

  const query = useQuery({
    queryKey: ["home-widget", "contracts-expiring", todayYmd],
    enabled: !!tenant,
    queryFn: async () => {
      const res = await searchEntities(
        "users",
        { page: 1, size: 1, fields: ["id"] },
        {
          filter_params: [
            {
              field_name: "contract_expiry_date",
              operator: operatorEnum.isnull,
              value: "false",
            },
            {
              field_name: "contract_expiry_date",
              operator: operatorEnum.gte,
              value: todayYmd,
            },
            {
              field_name: "contract_expiry_date",
              operator: operatorEnum.lte,
              value: in30DaysYmd,
            },
          ],
        },
      );
      return res.data?.count ?? 0;
    },
  });

  const loading = tenantLoading || query.isLoading;
  const error = query.isError
    ? parseSchedjuiceApiError(query.error, "Failed to load contracts.")
    : undefined;
  const count = query.data ?? 0;
  const empty = !loading && !error && count === 0;

  return (
    <DashboardCard
      title="Contracts expiring"
      span="sm"
      loading={loading}
      empty={empty}
      error={error}
    >
      <div className="space-y-4">
        <p className="text-3xl font-semibold tracking-tight font-mono tabular-nums">
          {count}
        </p>
        <p className="text-sm text-text-muted">
          Within the next 30 days
        </p>
        <Link
          href="/users"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View users
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </DashboardCard>
  );
}
