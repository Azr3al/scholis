"use client";

import { QuizPendingEssayGradingNotice } from "@/components/quiz-v3/results/quiz-pending-essay-grading-notice";
import { formatDateTime } from "@/helpers/date";
import {
  formatQuizAttemptOverdue,
} from "@/helpers/formatters";
import type { LearnerAttemptAwaitingRelease } from "@/types/quiz-v3";

type Props = {
  data: LearnerAttemptAwaitingRelease;
  quizTitle?: string;
};

export function LearnerQuizAwaitingReleasePanel({ data, quizTitle }: Props) {
  const overdue = (data.overdue_seconds ?? 0) > 0;

  return (
    <div className="space-y-8">
      <div className="bg-surface-elevated border-border rounded-2xl border px-5 py-8 text-center shadow-sm sm:px-7 sm:py-9">
        <p className="text-primary text-xs font-semibold uppercase tracking-wider">
          Submitted
        </p>
        {quizTitle ? (
          <p className="text-text-muted mt-3 text-base sm:text-lg">{quizTitle}</p>
        ) : null}
        <div className="mt-5">
          <QuizPendingEssayGradingNotice variant="card" />
        </div>
        <p className="text-text-muted mt-4 text-sm leading-relaxed">
          Your instructor will release detailed results when grading is complete.
        </p>
        {data.submitted_at ? (
          <p className="text-text-muted mt-5 text-sm">
            {formatDateTime(data.submitted_at)}
          </p>
        ) : null}
        {overdue ? (
          <p className="text-amber-700 mt-3 text-sm dark:text-amber-500">
            {formatQuizAttemptOverdue(data.overdue_seconds ?? 0)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
