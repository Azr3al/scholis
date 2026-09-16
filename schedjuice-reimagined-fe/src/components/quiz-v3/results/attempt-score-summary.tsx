"use client";

import { QuizRichContentHtml } from "@/components/quiz-v3/shared/quiz-rich-content";
import { QuizPendingEssayGradingNotice } from "@/components/quiz-v3/results/quiz-pending-essay-grading-notice";
import { formatDateTime } from "@/helpers/date";
import {
  formatQuizAttemptOverdue,
  formatQuizScorePair,
} from "@/helpers/formatters";
import { isQuizV3TiptapDocEmpty } from "@/helpers/quiz-v3-tiptap-empty";
import type { LearnerAttemptSummary } from "@/types/quiz-v3";

type Props = {
  summary: LearnerAttemptSummary;
};

export function AttemptScoreSummary({ summary }: Props) {
  const overdue = (summary.overdue_seconds ?? 0) > 0;
  const hideScoreForEssayGrading = summary.has_pending_essay_grading;

  return (
    <div className="space-y-8">
      <div className="bg-surface-elevated border-border rounded-2xl border px-5 py-8 text-center shadow-sm sm:px-7 sm:py-9">
        <p className="text-primary text-xs font-semibold uppercase tracking-wider">
          Submitted
        </p>
        <p className="text-text-muted mt-3 text-base sm:text-lg">
          {summary.quiz_title}
        </p>
        {hideScoreForEssayGrading ? (
          <QuizPendingEssayGradingNotice variant="card" />
        ) : (
          <>
            <p className="text-text-primary mt-5 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
              {formatQuizScorePair(summary.score, summary.max_score)}
            </p>
            <p className="text-text-muted mt-2 text-sm font-medium">
              Your score
            </p>
          </>
        )}
        {overdue ? (
          <p className="text-amber-700 mt-4 text-sm dark:text-amber-500">
            {formatQuizAttemptOverdue(summary.overdue_seconds)}
          </p>
        ) : null}
        <p className="text-text-muted mt-5 text-sm">
          {formatDateTime(summary.submitted_at)}
        </p>
      </div>

      {(summary.essay_feedback?.length ?? 0) > 0 ? (
        <div className="bg-surface-elevated border-border space-y-4 rounded-2xl border px-5 py-6 shadow-sm sm:px-7 sm:py-7">
          <h2 className="text-sm font-semibold">Written response feedback</h2>
          <ul className="space-y-5">
            {summary.essay_feedback!.map((row) => (
              <li key={row.answer_id} className="border-border space-y-3 border-b pb-5 last:border-b-0">
                <p className="text-text-muted text-xs font-medium">
                  Question #{row.question_id}
                </p>
                {!isQuizV3TiptapDocEmpty(row.feedback) ? (
                  <div className="rounded-md border bg-surface-sunken/15 p-3">
                    <QuizRichContentHtml value={row.feedback} />
                  </div>
                ) : null}
                {(row.comments?.length ?? 0) > 0 ? (
                  <ul className="list-none space-y-2 text-sm">
                    {row.comments!.map((c, i) => (
                      <li key={c.id ?? `${row.answer_id}-${i}`} className="rounded-md border px-3 py-2">
                        <span className="text-text-muted text-xs">
                          {c.anchor_start}–{c.anchor_end}:{" "}
                        </span>
                        <span className="whitespace-pre-wrap break-words">{c.body}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
