"use client";

import { makePostRequest } from "@/app/client-api/utils";
import { DashboardCard } from "@/components/home/dashboard-card";
import { queryParamDefault } from "@/config/defaults";
import { resolveDateRange } from "@/helpers/date-range-presets";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import type { AttendanceGodViewDailySearchResponse } from "@/types/attendance-god-view";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "iconoir-react";
import Link from "next/link";
import { useMemo } from "react";

export default function AttendanceOverviewWidget() {
  const todayRange = useMemo(
    () => resolveDateRange("today", null, null),
    [],
  );

  const query = useQuery({
    queryKey: ["home-widget", "attendance-overview", todayRange?.start],
    enabled: !!todayRange,
    queryFn: async () => {
      const res = await makePostRequest(
        "attendances/god-view/search",
        {
          mode: "daily_absences",
          date_from: todayRange!.start,
          date_to: todayRange!.end,
          sort: "attendance_rate_asc",
        },
        { ...queryParamDefault, page: 1, size: 1 },
      );
      return res.data as AttendanceGodViewDailySearchResponse;
    },
  });

  const loading = query.isLoading;
  const error = query.isError
    ? parseSchedjuiceApiError(query.error, "Failed to load attendance.")
    : undefined;
  const summary = query.data?.data?.summary;
  const present = summary?.present_count ?? 0;
  const absent = summary?.absent_count ?? 0;
  const hasData = present + absent + (summary?.late_count ?? 0) > 0;
  const empty = !loading && !error && !hasData;

  return (
    <DashboardCard
      title="Attendance overview"
      span="md"
      loading={loading}
      empty={empty}
      error={error}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-text-muted">Present</p>
            <p className="text-3xl font-semibold tracking-tight font-mono tabular-nums">
              {present}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Absent</p>
            <p className="text-3xl font-semibold tracking-tight font-mono tabular-nums text-danger">
              {absent}
            </p>
          </div>
        </div>
        <p className="text-sm text-text-muted">Today&apos;s attendance</p>
        <Link
          href="/attendances/god-view"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open attendance overview
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </DashboardCard>
  );
}
