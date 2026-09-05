"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { makeGetRequest } from "@/app/client-api/utils";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { DashboardCard } from "../dashboard-card";

type UpcomingRow = {
  kind: string;
  id: number;
  title: string;
  due_datetime: string;
  course_id: number;
  course_title: string | null;
};

type AssessmentsPayload = {
  upcoming_assignments: UpcomingRow[];
};

const LIMIT = 3;

export default function AssignmentsDueWidget() {
  const { user, isLoading: userLoading } = useUser();
  const userId = user?.id != null ? String(user.id) : "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["widget-assignments-due", userId],
    queryFn: async () => {
      const res = await makeGetRequest(`users/${userId}/assessments`, {});
      return res.data as {
        isError?: boolean;
        data?: AssessmentsPayload;
      };
    },
    enabled: isValidApiEntityIdParam(userId),
  });

  const upcoming = (data?.data?.upcoming_assignments ?? []).slice(0, LIMIT);
  const loading = userLoading || isLoading;
  const error = isError ? "Could not load assignments." : undefined;

  return (
    <DashboardCard
      title="Assignments due"
      span="md"
      loading={loading}
      empty={!loading && !error && upcoming.length === 0}
      error={error}
    >
      <ul className="space-y-3">
        {upcoming.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium">{row.title}</p>
              <p className="text-text-muted">
                {row.course_title ?? "Course"} · Due{" "}
                {row.due_datetime ? (
                  <span className="font-mono">
                    {format(new Date(row.due_datetime), "MMM d, HH:mm")}
                  </span>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <Link
              href={`/assignments/${row.id}`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              Submit
            </Link>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
