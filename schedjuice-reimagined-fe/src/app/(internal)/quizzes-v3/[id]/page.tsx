"use client";
import { buttonVariants, Skeleton } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import { PrimaryTeacherLine } from "@/components/course/primary-teacher-line";
import { QuizStatusBadge } from "@/components/quiz-v3/shared/quiz-status-badge";
import { QuizTakeLinkCard } from "@/components/quiz-v3/shared/quiz-take-link-card";
import { useToast } from "@/components/primitives";
import { formatDateTime } from "@/helpers/date";
import { QuizStatus, type QuizTypeV3 } from "@/types/quiz-v3";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

function courseScopedBackLink(quiz: QuizTypeV3): {
  href: string;
  label: string;
} | null {
  const c = quiz.course;
  if (typeof c === "number" && Number.isFinite(c)) {
    return { href: `/courses/${c}`, label: "Course" };
  }
  if (
    c &&
    typeof c === "object" &&
    typeof (c as { id?: unknown }).id === "number"
  ) {
    const courseId = (c as { id: number }).id;
    const title = (c as { title?: unknown }).title;
    return {
      href: `/courses/${courseId}`,
      label: typeof title === "string" && title.trim() ? title.trim() : "Course",
    };
  }
  return null;
}

function CreatedByLine({ quiz }: { quiz: QuizTypeV3 }) {
  const cb = quiz.created_by;
  if (cb && typeof cb === "object" && "name" in cb && cb.name) {
    return (
      <PrimaryTeacherLine
        teacher={{
          id: cb.id,
          name: cb.name,
          email: cb.email ?? "",
        }}
        profileUserId={cb.id}
        className="text-sm"
      />
    );
  }
  return <span className="text-text-secondary text-sm">—</span>;
}

export default function QuizV3DetailPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const q = useQuery({
    queryKey: ["quiz-v3", id],
    queryFn: () =>
      fetchEntity("quizzes", id, [
        "questions",
        "questions.options",
        "category",
        "course",
        "created_by",
      ]),
    enabled: Number.isFinite(id),
  });
  const quiz = q.data?.data?.data as QuizTypeV3 | undefined;

  const statusMutation = useMutation({
    mutationFn: (status: QuizStatus) =>
      updateEntity("quizzes", id, { status }),
    onSuccess: () => {
      toast.add({ description: "Status updated." });
      qc.invalidateQueries({ queryKey: ["quiz-v3", id] });
    },
  });

  if (q.isLoading) {
    return (
      <PageContainer
        width="default"
        className="space-y-4"
        aria-busy="true"
        aria-label="Loading quiz"
      >
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </PageContainer>
    );
  }
  if (q.isError || !quiz) {
    return (
      <p className="text-danger text-sm" role="alert">
        Failed to load quiz.
      </p>
    );
  }

  const takeUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/take/${quiz.code}`
      : `/take/${quiz.code}`;

  const subs = quiz.submission_count ?? 0;
  const unique = quiz.unique_respondent_count ?? 0;
  const questions = quiz.total_questions ?? 0;
  const courseBack = courseScopedBackLink(quiz);

  return  (
<PageContainer width="default" className="space-y-4">
      <Link
        href={courseBack?.href ?? "/quizzes-v3"}
        className="inline-flex w-fit max-w-full items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">
          {courseBack?.label ?? "Quizzes"}
        </span>
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{quiz.title}</h1>
          <div className="mt-2">
            <QuizStatusBadge status={quiz.status as QuizStatus} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/quizzes-v3/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary"  }), "gap-2")}
          >
            Edit questions
          </Link>
          <Link
            href={`/quizzes-v3/${id}/responses`}
            className={cn(buttonVariants({ variant: "secondary"  }), "gap-2")}
          >
            Responses
          </Link>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <p className="font-medium">Overview</p>
          <p className="text-text-secondary mt-1">
            Submissions: {subs} · Unique students: {unique} · Questions:{" "}
            {questions}
          </p>
        </div>
        <div>
          <p className="font-medium">Created by</p>
          <div className="mt-1">
            <CreatedByLine quiz={quiz} />
          </div>
        </div>
        <div className="text-text-secondary space-y-1 text-xs">
          {quiz.created_at ? (
            <p>Created {formatDateTime(quiz.created_at)}</p>
          ) : null}
          {quiz.updated_at ? (
            <p>Last updated {formatDateTime(quiz.updated_at)}</p>
          ) : null}
        </div>
      </div>

      <QuizTakeLinkCard
        takeUrl={takeUrl}
        status={quiz.status as QuizStatus}
        activationDate={quiz.activation_date}
        expiryDate={quiz.expiry_date}
        allowedMinutes={quiz.allowed_minutes}
        maxRetakes={quiz.max_retakes}
        onStatusChange={(next) => statusMutation.mutate(next)}
        isStatusPending={statusMutation.isPending}
      />
    </PageContainer>
);
}
