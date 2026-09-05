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

type RecentUserRow = {
  id: number;
  name: string;
  created_at?: string;
};

export default function NewRegistrationsWidget() {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const timezone = tenant?.timezone ?? "UTC";
  const todayYmd = getTenantTodayYmd(timezone);
  const sevenDaysAgoYmd = addCalendarDaysToTenantYmd(todayYmd, timezone, -7);

  const query = useQuery({
    queryKey: ["home-widget", "new-registrations", sevenDaysAgoYmd],
    enabled: !!tenant,
    queryFn: async () => {
      const recentFilters = [
        {
          field_name: "created_at",
          operator: operatorEnum.gte,
          value: `${sevenDaysAgoYmd}T00:00:00`,
        },
      ];

      const recentRes = await searchEntities(
        "users",
        {
          page: 1,
          size: 5,
          sorts: ["-created_at"],
          fields: ["id", "name", "created_at"],
        },
        { filter_params: recentFilters },
      );

      let users = (recentRes.data?.data ?? []) as RecentUserRow[];
      let usedRecentFilter = users.length > 0;

      if (users.length === 0) {
        const fallbackRes = await searchEntities(
          "users",
          {
            page: 1,
            size: 5,
            sorts: ["-created_at"],
            fields: ["id", "name", "created_at"],
          },
          {},
        );
        users = (fallbackRes.data?.data ?? []) as RecentUserRow[];
        usedRecentFilter = false;
      }

      return { users, usedRecentFilter };
    },
  });

  const loading = tenantLoading || query.isLoading;
  const error = query.isError
    ? parseSchedjuiceApiError(query.error, "Failed to load registrations.")
    : undefined;
  const users = query.data?.users ?? [];
  const usedRecentFilter = query.data?.usedRecentFilter ?? true;
  const empty = !loading && !error && users.length === 0;

  return (
    <DashboardCard
      title="New registrations"
      span="sm"
      loading={loading}
      empty={empty}
      error={error}
    >
      <div className="space-y-4">
        <p className="text-3xl font-semibold tracking-tight font-mono tabular-nums">
          {users.length}
        </p>
        <p className="text-sm text-text-muted">
          {usedRecentFilter ? "Registered in the last 7 days" : "Latest registrations"}
        </p>
        <ul className="space-y-1 text-sm">
          {users.slice(0, 3).map((user) => (
            <li key={user.id} className="truncate text-text-primary/90">
              {user.name}
            </li>
          ))}
        </ul>
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
