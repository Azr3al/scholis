"use client";

import { cn } from "@/lib/utils";
import { Button, Skeleton, buttonVariants } from "@/components/primitives";

import { makeGetRequest } from "@/app/client-api/utils";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Lock } from "iconoir-react";
import Link from "next/link";

type UpcomingRow = {
  kind: string;
  id: number;
  title: string;
  due_datetime: string;
  course_id: number;
  course_title: string | null;
};

type AssignmentGradeRow = {
  kind: "assignment_submission";
  id: number;
  assignment_id: number;
  title: string;
  course_id: number;
  course_title: string | null;
  user_score: number | null;
  feedback?: string | null;
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
      /** Learner take UUID; may be absent on legacy payloads. */
      quiz_code?: string | null;
      title: string;
      course_id: number | null;
      course_title: string | null;
      score: string;
      max_score: number;
      submitted_at: string | null;
    };

type AssessmentsPayload = {
  upcoming_assignments: UpcomingRow[];
  past: PastRow[];
};

function isAssignmentGradeRow(row: PastRow): row is AssignmentGradeRow {
  return row.kind === "assignment_submission";
}

export function UserProfileAssessments({
  userId,
  embedded = false,
}: {
  userId: string;
  embedded?: boolean;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["userAssessments", userId],
    queryFn: async () => {
      const res = await makeGetRequest(`users/${userId}/assessments`, {});
      return res.data as {
        isError?: boolean;
        data?: AssessmentsPayload;
      };
    },
    enabled: !!userId,
  });

  const payload = data?.data;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-4" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (isError || !payload) {
    return (
      <div className="rounded-md border border-border p-4 text-sm">
        <p className="text-destructive">Could not load assessments.</p>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const upcoming = payload.upcoming_assignments ?? [];
  const assignmentGrades = (payload.past ?? []).filter(
    (row): row is AssignmentGradeRow =>
      isAssignmentGradeRow(row) && row.is_graded,
  );

  return (
    <div className={embedded ? "sj-root flex flex-col gap-8" : "flex flex-col gap-8"}>
      <section className="space-y-2">
        <h3
          className={
            embedded
              ? "font-serif text-lg text-text-primary"
              : "text-sm font-medium text-text-primary"
          }
        >
          Upcoming assignments
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-text-muted">No upcoming assignment deadlines.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {upcoming.map((row) => (
              <li key={`up-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{row.title}</p>
                  <p className="text-text-muted">
                    {row.course_title ?? "Course"} · Due{" "}
                    {row.due_datetime
                      ? format(new Date(row.due_datetime), "MMM d, yyyy HH:mm")
                      : "—"}
                  </p>
                </div>
                <Link href={`/assignments/${row.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3
          className={
            embedded
              ? "font-serif text-lg text-text-primary"
              : "text-sm font-medium text-text-primary"
          }
        >
          Assignment grades
        </h3>
        {assignmentGrades.length === 0 ? (
          <p className="text-sm text-text-muted">No graded assignments yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {assignmentGrades.map((row) => (
              <li
                key={`grade-a-${row.id}`}
                className="flex flex-wrap items-start justify-between gap-3 px-3 py-3 text-sm"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{row.title}</p>
                    {row.are_results_released ? (
                      <span className="inline-flex items-center rounded-md border border-transparent bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent bg-green-600">
                        Released
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary gap-1">
                        <Lock className="h-3 w-3" aria-hidden />
                        Results not released yet
                      </span>
                    )}
                  </div>
                  <p className="text-text-muted">
                    {row.course_title ?? "Course"}
                    {row.updated_at && (
                      <span>
                        {" "}
                        · Updated{" "}
                        {format(new Date(row.updated_at), "MMM d, yyyy")}
                      </span>
                    )}
                  </p>
                  {row.are_results_released && row.user_score != null && (
                    <p className="font-medium text-text-primary">
                      Score: {row.user_score}
                    </p>
                  )}
                  {row.are_results_released && row.feedback?.trim() && (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                      <p className="text-xs font-medium text-text-muted">
                        Teacher feedback
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-text-primary">
                        {row.feedback}
                      </p>
                    </div>
                  )}
                </div>
                <Link href={`/assignments/${row.assignment_id}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}>View</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
