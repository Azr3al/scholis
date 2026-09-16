"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import { QuizAttemptsTable } from "@/components/quiz-v3/results/attempts-table";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { Skeleton } from "@/components/primitives";
import type { QuizTypeV3 } from "@/types/quiz-v3";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { NavArrowLeft } from "iconoir-react";

export default function QuizV3ResponsesPage() {
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

  if (q.isLoading) {
    return (
      <PageContainer
        width="wide"
        className="space-y-4"
        aria-busy="true"
        aria-label="Loading quiz responses"
      >
        <Skeleton className="h-6 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <TableSkeleton columns={5} rows={8} showPagination />
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

  const hasEssay = Boolean(quiz.has_essay_questions);

  return  (
<PageContainer width="wide" className="space-y-4">
      <Link
        href={`/quizzes-v3/${id}`}
        className="text-text-secondary hover:text-text-primary inline-flex w-fit items-center gap-2 text-sm font-medium"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Quiz
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{quiz.title}</h1>
        <p className="text-text-secondary mt-2 max-w-2xl text-sm">
          Submitted attempts.
          {hasEssay
            ? " This quiz includes written responses. Use waive when ungraded work should count as zero, then release when students should see their detailed results."
            : null}
        </p>
      </div>
      <QuizAttemptsTable quizId={id} hasEssayQuestions={hasEssay} />
    </PageContainer>
);
}
