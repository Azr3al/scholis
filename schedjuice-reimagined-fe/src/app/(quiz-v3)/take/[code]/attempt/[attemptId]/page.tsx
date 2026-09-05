"use client";

import { encodeArrayToBase64 } from "@/app/client-api/utils";
import { AttemptDetail } from "@/components/quiz-v3/results/attempt-detail";
import { AttemptScoreSummary } from "@/components/quiz-v3/results/attempt-score-summary";
import { QuizTakeCourseReturnButton } from "@/components/quiz-v3/shared/quiz-take-course-return-button";
import { QuizTakeFetchError } from "@/components/quiz-v3/shared/quiz-take-fetch-error";
import { QuizTakeShell } from "@/components/quiz-v3/shared/quiz-take-shell";
import { Skeleton } from "@/components/primitives";
import { quizTakeQueryRetryPredicate } from "@/helpers/quiz-v3-api-error";
import { axiosClient } from "@/lib/api";
import { parseQuizThemeV3 } from "@/lib/quiz-v3-theme-presets";
import {
  learnerAttemptAwaitingReleaseSchema,
  learnerAttemptSummarySchema,
  type QuizTypeV3,
} from "@/types/quiz-v3";
import { LearnerQuizAwaitingReleasePanel } from "@/components/quiz-v3/results/learner-quiz-awaiting-release-panel";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

const EXPAND_FULL = encodeArrayToBase64([
  "answers",
  "answers.question",
  "answers.question.options",
  "quiz",
  "user",
]);

export default function TakeQuizAttemptResultPage() {
  const params = useParams<{ code: string; attemptId: string }>();
  const code = params.code ?? "";
  const attemptId = Number(params.attemptId);

  const preview = useQuery({
    queryKey: ["quiz-v3-preview", code],
    queryFn: async () => {
      const res = await axiosClient.get(`quizzes/take/${code}/preview`);
      return res.data?.data as {
        quiz_theme?: string;
        logo_url?: string | null;
        organization_name?: string | null;
        course?: number | null;
      };
    },
    enabled: code.length > 0,
    staleTime: 60_000,
    retry: quizTakeQueryRetryPredicate,
  });

  const theme = parseQuizThemeV3(preview.data?.quiz_theme);
  const logoUrl = preview.data?.logo_url ?? null;
  const organizationName = preview.data?.organization_name ?? null;
  const shellBrandingLoading = preview.isLoading;

  const q = useQuery({
    queryKey: ["quiz-v3-take-attempt-result", code, attemptId],
    queryFn: async () => {
      const res = await axiosClient.get(
        `quizzes/take/${code}/attempts/${attemptId}?expand=${encodeURIComponent(EXPAND_FULL)}`,
      );
      return res.data?.data as unknown;
    },
    enabled: Boolean(code) && Number.isFinite(attemptId),
    retry: quizTakeQueryRetryPredicate,
  });

  const raw = q.data;

  const shellProps = {
    contextLabel: "Results" as const,
    theme,
    logoUrl,
    organizationName,
    isBrandingLoading: shellBrandingLoading,
  };

  const courseId =
    typeof preview.data?.course === "number" &&
    Number.isFinite(preview.data.course)
      ? preview.data.course
      : null;

  function wrapWithCourseCta(node: ReactNode) {
    if (courseId == null) return node;
    return (
      <>
        {node}
        <QuizTakeCourseReturnButton courseId={courseId} />
      </>
    );
  }

  if (q.isLoading) {
    return (
      <QuizTakeShell {...shellProps}>
        <Skeleton className="h-40 w-full rounded-xl" aria-busy="true" />
      </QuizTakeShell>
    );
  }
  if (q.isError) {
    return (
      <QuizTakeShell {...shellProps}>
        <QuizTakeFetchError
          error={q.error}
          fallback="Could not load results."
        />
      </QuizTakeShell>
    );
  }
  if (raw == null) {
    return (
      <QuizTakeShell {...shellProps}>
        <QuizTakeFetchError fallback="Could not load results." />
      </QuizTakeShell>
    );
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "review_mode" in raw &&
    (raw as { review_mode?: string }).review_mode === "awaiting_release"
  ) {
    const parsed = learnerAttemptAwaitingReleaseSchema.safeParse(raw);
    if (!parsed.success) {
      return (
        <QuizTakeShell {...shellProps}>
          <p className="text-danger text-sm" role="alert">
            Invalid result data.
          </p>
        </QuizTakeShell>
      );
    }
    return (
      <QuizTakeShell {...shellProps}>
        {wrapWithCourseCta(<LearnerQuizAwaitingReleasePanel data={parsed.data} />)}
      </QuizTakeShell>
    );
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "review_mode" in raw &&
    (raw as { review_mode?: string }).review_mode === "summary"
  ) {
    const parsed = learnerAttemptSummarySchema.safeParse(raw);
    if (!parsed.success) {
      return (
        <QuizTakeShell {...shellProps}>
          <p className="text-danger text-sm" role="alert">
            Invalid result data.
          </p>
        </QuizTakeShell>
      );
    }
    return (
      <QuizTakeShell {...shellProps}>
        {wrapWithCourseCta(<AttemptScoreSummary summary={parsed.data} />)}
      </QuizTakeShell>
    );
  }

  const row = raw as ComponentProps<typeof AttemptDetail>["attempt"] & {
    review_mode?: string;
    quiz?: number | QuizTypeV3;
  };
  const { review_mode: _reviewMode, quiz: quizField, ...attemptRest } = row;
  const quizTitle =
    typeof quizField === "object" && quizField?.title
      ? quizField.title
      : undefined;

  return (
    <QuizTakeShell {...shellProps}>
      {wrapWithCourseCta(
        <AttemptDetail
          attempt={attemptRest}
          variant="learner"
          quizTitle={quizTitle}
        />,
      )}
    </QuizTakeShell>
  );
}
