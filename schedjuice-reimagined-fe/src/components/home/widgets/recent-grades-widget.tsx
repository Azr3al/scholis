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

type AssignmentGradeRow = {
  kind: "assignment_submission";
  id: number;
  assignment_id: number;
  title: string;
  course_id: number;
  course_title: string | null;
  user_score: number | null;
  is_graded: boolean;
  are_results_released: boolean;
  updated_at: string | null;
};

type PastRow =
  | AssignmentGradeRow
  | {
      kind: "quiz_attempt";
      attempt_id: number;
      quiz_id: number;
      title: string;
      course_id: number | null;
      course_title: string | null;
      score: string;
      max_score: number;
      submitted_at: string | null;
    };

type AssessmentsPayload = {
  past: PastRow[];
};

const LIMIT = 3;

function isReleasedGrade(row: PastRow): row is AssignmentGradeRow {
  return (
    row.kind === "assignment_submission" &&
    row.is_graded &&
    row.are_results_released
  );
}

export default function RecentGradesWidget() {
  const { user, isLoading: userLoading } = useUser();
  const userId = user?.id != null ? String(user.id) : "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["widget-recent-grades", userId],
    queryFn: async () => {
      const res = await makeGetRequest(`users/${userId}/assessments`, {});
      return res.data as {
        isError?: boolean;
        data?: AssessmentsPayload;
      };
    },
    enabled: isValidApiEntityIdParam(userId),
  });

  const grades = (data?.data?.past ?? [])
    .filter(isReleasedGrade)
    .slice(0, LIMIT);
  const loading = userLoading || isLoading;
  const error = isError ? "Could not load grades." : undefined;

  return (
    <DashboardCard
      title="Recent grades"
      span="sm"
      loading={loading}
      empty={!loading && !error && grades.length === 0}
      error={error}
    >
      <ul className="space-y-3">
        {grades.map((row) => (
          <li key={row.id} className="space-y-1 text-sm">
            <p className="font-medium">{row.title}</p>
            <p className="text-text-muted">
              {row.course_title ?? "Course"}
              {row.updated_at ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-mono">
                    {format(new Date(row.updated_at), "MMM d")}
                  </span>
                </>
              ) : null}
            </p>
            {row.user_score != null ? (
              <p className="font-mono text-text-primary">
                Score: {row.user_score}
              </p>
            ) : null}
            <Link
              href={`/courses/${row.course_id}/assessments`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-auto p-0",
              )}
            >
              View assessments
            </Link>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
