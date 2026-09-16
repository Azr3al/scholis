import { buttonVariants } from "@/components/primitives";
import Link from "next/link";
import { formatDateTime } from "@/helpers/date";
import type { LearnerQuizSummary, QuizTypeV3 } from "@/types/quiz-v3";

type QuizAssessmentCardProps = {
  quiz: QuizTypeV3 & { kind?: string; learner_quiz?: LearnerQuizSummary | null };
  canManageCourse: boolean;
};

export function QuizAssessmentCard({
  quiz,
  canManageCourse,
}: QuizAssessmentCardProps) {
  const title =
    quiz.title.length > 40 ? `${quiz.title.slice(0, 40)}…` : quiz.title;
  const summary = quiz.learner_quiz;
  const takeHref = `/take/${quiz.code}`;

  return (
    <div className="flex min-w-[320px] flex-col justify-between rounded-lg border border-border bg-surface shadow-none">
      <div className="p-6">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-medium">{title}</h3>
          <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
            Quiz
          </span>
        </div>
      </div>
      <div className="p-6 pt-0">
        <p className="flex flex-col gap-1 text-sm text-text-secondary">
          <span>Status: {quiz.status}</span>
          {quiz.created_at && (
            <span>Created: {formatDateTime(quiz.created_at)}</span>
          )}
          {!canManageCourse && summary ? (
            <span className="text-foreground">
              Attempts used: {summary.completed_attempts}/{summary.max_attempts}
              {summary.has_in_progress_attempt ? " · In progress" : null}
            </span>
          ) : null}
          {!canManageCourse && summary?.attempts_exhausted_message ? (
            <span className="text-destructive font-medium">
              {summary.attempts_exhausted_message}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex flex-col gap-2 p-6 pt-0 sm:flex-row">
        {canManageCourse ? (
          <Link
            href={`/quizzes-v3/${quiz.id}`}
            className={buttonVariants({
              variant: "secondary",
              className: "w-full",
            })}
          >
            Details
          </Link>
        ) : summary?.may_submit_new_attempt ? (
          <Link
            href={takeHref}
            className={buttonVariants({
              variant: "primary",
              className: "w-full",
            })}
          >
            {summary.has_in_progress_attempt ? "Continue quiz" : "Take quiz"}
          </Link>
        ) : (
          <p className="text-muted-foreground w-full text-center text-sm">
            No attempts remaining.
          </p>
        )}
      </div>
    </div>
  );
}
