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
import type { courseType } from "@/types/course";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "iconoir-react";
import Link from "next/link";

export default function CoursesStartingWidget() {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const timezone = tenant?.timezone ?? "UTC";
  const todayYmd = getTenantTodayYmd(timezone);
  const in14DaysYmd = addCalendarDaysToTenantYmd(todayYmd, timezone, 14);

  const query = useQuery({
    queryKey: ["home-widget", "courses-starting", todayYmd, in14DaysYmd],
    enabled: !!tenant,
    queryFn: async () => {
      const res = await searchEntities(
        "courses",
        {
          page: 1,
          size: -1,
          sorts: ["start_date", "title"],
          fields: ["id", "title", "start_date"],
        },
        {
          filter_params: [
            {
              field_name: "start_date",
              operator: operatorEnum.gte,
              value: todayYmd,
            },
            {
              field_name: "start_date",
              operator: operatorEnum.lte,
              value: in14DaysYmd,
            },
          ],
        },
      );
      const courses = (res.data?.data ?? []) as Pick<
        courseType,
        "id" | "title" | "start_date"
      >[];
      return {
        count: res.data?.count ?? courses.length,
        topCourses: courses.slice(0, 2),
      };
    },
  });

  const loading = tenantLoading || query.isLoading;
  const error = query.isError
    ? parseSchedjuiceApiError(query.error, "Failed to load courses.")
    : undefined;
  const count = query.data?.count ?? 0;
  const topCourses = query.data?.topCourses ?? [];
  const empty = !loading && !error && count === 0;

  return (
    <DashboardCard
      title="Courses starting soon"
      span="md"
      loading={loading}
      empty={empty}
      error={error}
    >
      <div className="space-y-4">
        <p className="text-3xl font-semibold tracking-tight font-mono tabular-nums">
          {count}
        </p>
        <p className="text-sm text-text-muted">
          Starting in the next 14 days
        </p>
        {topCourses.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {topCourses.map((course) => (
              <li key={course.id} className="truncate text-text-primary/90">
                {course.title}
              </li>
            ))}
          </ul>
        ) : null}
        <Link
          href="/shortcuts/starting-courses"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View starting courses
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </DashboardCard>
  );
}
