"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { makePostRequest } from "@/app/client-api/utils";
import { queryParamDefault } from "@/config/defaults";
import { getCalendarMonthUtcFilterBounds } from "@/helpers/date";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useMemo } from "react";
import { DashboardCard } from "../dashboard-card";

type UnpaidCourseSummaryRow = {
  course_id: number;
  unpaid_count: number;
};

function unwrapSummaryRows(res: {
  data?: { data?: unknown; isError?: boolean };
}): UnpaidCourseSummaryRow[] {
  const inner = res.data?.data;
  if (Array.isArray(inner)) return inner as UnpaidCourseSummaryRow[];
  if (
    inner &&
    typeof inner === "object" &&
    Array.isArray((inner as { data?: unknown }).data)
  ) {
    return (inner as { data: UnpaidCourseSummaryRow[] }).data;
  }
  return [];
}

export default function UnpaidStudentsWidget() {
  const { user } = useUser();
  const { tenant } = useTenant();
  const now = useMemo(() => new Date(), []);

  const summaryQuery = useQuery({
    queryKey: ["widget-unpaid-students", now.getFullYear(), now.getMonth()],
    queryFn: async () => {
      const bounds = getCalendarMonthUtcFilterBounds(now);
      const res = await makePostRequest(
        "user-payments/unpaid-course-summary",
        {
          filter_params: [
            {
              field_name: "issued_at",
              operator: operatorEnum.gte,
              value: bounds.start.toISOString(),
            },
            {
              field_name: "issued_at",
              operator: operatorEnum.lte,
              value: bounds.end.toISOString(),
            },
          ],
          exclude_params: [],
        },
        queryParamDefault,
      );
      return unwrapSummaryRows(res);
    },
    enabled: !!user && !!tenant,
  });

  const count = useMemo(
    () =>
      (summaryQuery.data ?? []).reduce(
        (sum, row) => sum + (row.unpaid_count ?? 0),
        0,
      ),
    [summaryQuery.data],
  );

  const ctaHref = `/finances/unpaid-students?date=${encodeURIComponent(now.toISOString())}`;

  return (
    <DashboardCard
      title="Unpaid students"
      span="sm"
      loading={!user || !tenant || summaryQuery.isLoading}
      empty={!summaryQuery.isLoading && !summaryQuery.isError && count === 0}
      error={
        summaryQuery.isError ? "Could not load unpaid student counts." : undefined
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs text-text-muted">
            {format(now, "MMMM yyyy")}
          </p>
          <p className="font-mono text-2xl font-semibold tabular-nums">{count}</p>
        </div>
        <Link
          href={ctaHref}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          View unpaid
        </Link>
      </div>
    </DashboardCard>
  );
}
