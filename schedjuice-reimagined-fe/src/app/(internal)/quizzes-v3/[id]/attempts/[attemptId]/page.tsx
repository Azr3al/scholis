"use client";

import { PageContainer } from "@/components/layout/page-container";
import type { ComponentProps } from "react";
import { fetchEntity } from "@/app/client-api/utils";
import { AttemptDetail } from "@/components/quiz-v3/results/attempt-detail";
import { StaffQuizEssayGradingPanel } from "@/components/quiz-v3/results/staff-quiz-essay-grading-panel";
import { Skeleton } from "@/components/primitives";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { NavArrowLeft } from "iconoir-react";
import type { QuizTypeV3 } from "@/types/quiz-v3";

export default function QuizV3AttemptDetailPage() {
  const params = useParams<{ id: string; attemptId: string }>();
  const quizId = Number(params.id);
  const attemptId = Number(params.attemptId);

  const q = useQuery({
    queryKey: ["quiz-v3-attempt", attemptId],
    queryFn: () =>
      fetchEntity(`quizzes/attempts`, attemptId, [
        "answers",
        "answers.question",
        "answers.question.options",
        "user",
        "quiz",
      ]),
    enabled: Number.isFinite(attemptId),
  });

  const attempt = q.data?.data?.data as ComponentProps<
    typeof AttemptDetail
  >["attempt"] & {
    quiz?: number | QuizTypeV3;
  };

  if (q.isLoading) {
    return (
      <PageContainer
        width="default"
        className="space-y-4"
        aria-busy="true"
        aria-label="Loading quiz attempt"
      >
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </PageContainer>
    );
  }
  if (q.isError || !attempt) {
    return (
      <p className="text-danger text-sm" role="alert">
        Failed to load attempt.
      </p>
    );
  }

  const quizField = attempt.quiz;
  const hasEssay =
    typeof quizField === "object" &&
    quizField != null &&
    Boolean((quizField as QuizTypeV3).has_essay_questions);

  return  (
<PageContainer width="default" className="space-y-4">
      <Link
        href={`/quizzes-v3/${quizId}/responses`}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Responses
      </Link>
      <h1 className="text-xl font-semibold">Attempt #{attempt.id}</h1>
      <AttemptDetail attempt={attempt} />
      {hasEssay ? (
        <StaffQuizEssayGradingPanel
          quizId={quizId}
          attemptId={attemptId}
          answers={
            (attempt.answers ?? []) as Parameters<
              typeof StaffQuizEssayGradingPanel
            >[0]["answers"]
          }
        />
      ) : null}
    </PageContainer>
);
}
