"use client";

import { searchEntities } from "@/app/client-api/utils";
import { DashboardCard } from "@/components/home/dashboard-card";
import { getTenantTodayYmd } from "@/helpers/shortcuts-time";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useTenant } from "@/hooks/useTenant";
import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "iconoir-react";
import Link from "next/link";

export default function TodaysCheckinsWidget() {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const timezone = tenant?.timezone ?? "UTC";
  const todayYmd = getTenantTodayYmd(timezone);

  const query = useQuery({
    queryKey: ["home-widget", "todays-checkins", todayYmd],
    enabled: !!tenant,
    queryFn: async () => {
      const baseFilters = [
        {
          field_name: "event__date",
          operator: operatorEnum.gte,
          value: todayYmd,
        },
        {
          field_name: "event__date",
          operator: operatorEnum.lte,
          value: todayYmd,
        },
        {
          field_name: "user__roles",
          operator: operatorEnum.contains,
          value: "{teacher}",
        },
      ];

      const [totalRes, checkedInRes] = await Promise.all([
        searchEntities(
          "user-events",
          { page: 1, size: 1, fields: ["id"] },
          { filter_params: baseFilters },
        ),
        searchEntities(
          "user-events",
          { page: 1, size: 1, fields: ["id"] },
          {
            filter_params: [
              ...baseFilters,
              {
                field_name: "checkin_time",
                operator: operatorEnum.isnull,
                value: "false",
              },
            ],
          },
        ),
      ]);

      return {
        total: totalRes.data?.count ?? 0,
        checkedIn: checkedInRes.data?.count ?? 0,
      };
    },
  });

  const loading = tenantLoading || query.isLoading;
  const error = query.isError
    ? parseSchedjuiceApiError(query.error, "Failed to load check-ins.")
    : undefined;
  const total = query.data?.total ?? 0;
  const checkedIn = query.data?.checkedIn ?? 0;
  const empty = !loading && !error && total === 0;

  return (
    <DashboardCard
      title="Today's check-ins"
      span="md"
      loading={loading}
      empty={empty}
      error={error}
    >
      <div className="space-y-4">
        <p className="text-3xl font-semibold tracking-tight">
          <span className="font-mono tabular-nums">{checkedIn}</span>
          <span className="text-text-muted"> / </span>
          <span className="font-mono tabular-nums text-text-muted">
            {total}
          </span>
        </p>
        <p className="text-sm text-text-muted">
          Teachers checked in today
        </p>
        <Link
          href="/finances/checkin-histories"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View check-in histories
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </DashboardCard>
  );
}
