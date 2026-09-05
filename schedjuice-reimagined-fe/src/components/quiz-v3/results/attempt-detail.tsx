"use client";

import { PrimaryTeacherLine } from "@/components/course/primary-teacher-line";
import { AttemptQuestionReadonly } from "@/components/quiz-v3/results/attempt-question-readonly";
import { QuizPendingEssayGradingNotice } from "@/components/quiz-v3/results/quiz-pending-essay-grading-notice";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/quiz-v3/results/url-tabs";
import { formatDateTime } from "@/helpers/date";
import {
  formatQuizAttemptOverdue,
  formatQuizScorePair,
} from "@/helpers/formatters";
import { maskEmailLocalPart } from "@/helpers/mask-email-local";
import {
  isQuizAttemptInProgress,
  quizAttemptEarnedScoreDisplay,
} from "@/helpers/quiz-attempt-score";
import { QuestionType, type QuestionTypeV3 } from "@/types/quiz-v3";

type AnswerRow = {
  id: number;
  score: string;
  selected_option_ids: number[];
  response_text?: string | Record<string, unknown>;
  graded_at?: string | null;
  feedback?: unknown;
  comments?: Array<{
    id?: number;
    anchor_start: number;
    anchor_end: number;
    body: string;
  }>;
  question?: QuestionTypeV3 & { id: number };
};

type Props = {
  attempt: {
    id: number;
    score: string;
    max_score: number;
    started_at?: string;
    submitted_at?: string | null;
    overdue_seconds?: number;
    user?: { id?: number; name?: string; email?: string | null };
    answers?: AnswerRow[];
  };
  /** Staff attempt page (default) vs student viewing their own graded attempt. */
  variant?: "staff" | "learner";
  /** When `variant` is learner, shown instead of staff respondent identity. */
  quizTitle?: string;
};

function sortAnswers(answers: AnswerRow[]): AnswerRow[] {
  return [...answers].sort((a, b) => {
    const da = a.question?.display_order ?? 0;
    const db = b.question?.display_order ?? 0;
    if (da !== db) return da - db;
    return (a.question?.id ?? 0) - (b.question?.id ?? 0);
  });
}

export function AttemptDetail({
  attempt,
  variant = "staff",
  quizTitle,
}: Props) {
  const answers = sortAnswers(attempt.answers ?? []);
  const overallScoreDisplay = quizAttemptEarnedScoreDisplay(attempt);
  const inProgress = isQuizAttemptInProgress(attempt);

  const u = attempt.user;
  const isLearner = variant === "learner";
  const learnerHasPendingEssayGrading =
    isLearner &&
    answers.some(
      (a) =>
        a.question?.question_type === QuestionType.Essay &&
        a.graded_at == null,
    );

  if (isLearner) {
    return (
      <div className="space-y-8">
        <div className="bg-surface-elevated border-border rounded-2xl border px-5 py-6 shadow-sm sm:px-7 sm:py-7">
          <p className="text-primary text-xs font-semibold uppercase tracking-wider">
            Your results
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-[1.75rem]">
            {quizTitle?.trim() || "Quiz"}
          </h1>
          {learnerHasPendingEssayGrading ? (
            <>
              <QuizPendingEssayGradingNotice variant="banner" className="mt-5" />
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
                {attempt.submitted_at ? (
                  <span className="text-text-muted text-sm">
                    Submitted {formatDateTime(attempt.submitted_at)}
                  </span>
                ) : null}
                {(attempt.overdue_seconds ?? 0) > 0 ? (
                  <span className="text-amber-700 text-sm dark:text-amber-500">
                    {formatQuizAttemptOverdue(attempt.overdue_seconds ?? 0)}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <span className="bg-accent/12 text-primary inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold tabular-nums shadow-sm ring-1 ring-primary/10 transition-colors">
                Score{" "}
                {formatQuizScorePair(overallScoreDisplay, attempt.max_score)}
              </span>
              {attempt.submitted_at ? (
                <span className="text-text-muted text-sm">
                  Submitted {formatDateTime(attempt.submitted_at)}
                </span>
              ) : null}
              {(attempt.overdue_seconds ?? 0) > 0 ? (
                <span className="text-amber-700 text-sm dark:text-amber-500">
                  {formatQuizAttemptOverdue(attempt.overdue_seconds ?? 0)}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-text-muted text-sm font-medium">
            Questions
          </h2>
          {answers.map((a) => {
            const q = a.question;
            if (!q || q.id == null) {
              return (
                <div
                  key={a.id}
                  className="text-text-muted rounded-xl border border-dashed p-4 text-sm"
                >
                  Question data missing for this answer.
                </div>
              );
            }
            return (
              <AttemptQuestionReadonly
                key={a.id}
                question={q as QuestionTypeV3}
                selectedOptionIds={a.selected_option_ids ?? []}
                responseText={a.response_text}
                answerScore={a.score}
                maxPoints={q.points ?? 0}
                inProgress={inProgress}
                cardClassName="rounded-xl"
                essayFeedbackDoc={
                  q.question_type === QuestionType.Essay ? a.feedback : undefined
                }
                essayComments={
                  q.question_type === QuestionType.Essay ? a.comments : undefined
                }
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-text-muted flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="inline-flex min-w-0 items-baseline">
          {u?.name ? (
            <PrimaryTeacherLine
              teacher={{
                id: u.id ?? 0,
                name: u.name,
                email: u.email ?? "",
              }}
              profileUserId={u.id}
              className="!text-sm"
            />
          ) : (
            <span>
              Student
              {u?.email ? (
                <>
                  {" "}
                  · {maskEmailLocalPart(u.email)}
                </>
              ) : null}
            </span>
          )}
        </span>
        {inProgress ? (
          <>
            <span className="text-text-muted/80">·</span>
            <span className="font-medium text-text-primary">In progress</span>
            {attempt.started_at ? (
              <>
                <span className="text-text-muted/80">·</span>
                <span>Started {formatDateTime(attempt.started_at)}</span>
              </>
            ) : null}
          </>
        ) : (
          <>
            <span className="text-text-muted/80">·</span>
            <span>
              Score:{" "}
              {formatQuizScorePair(overallScoreDisplay, attempt.max_score)}
            </span>
            {(attempt.overdue_seconds ?? 0) > 0 ? (
              <>
                <span className="text-text-muted/80">·</span>
                <span className="text-amber-700 dark:text-amber-500">
                  {formatQuizAttemptOverdue(attempt.overdue_seconds ?? 0)}
                </span>
              </>
            ) : null}
            {attempt.submitted_at ? (
              <>
                <span className="text-text-muted/80">·</span>
                <span>{formatDateTime(attempt.submitted_at)}</span>
              </>
            ) : null}
          </>
        )}
      </p>

      <Tabs defaultValue="overview" searchParam="view">
        <TabsList className="!h-9 !text-base">
          <TabsTrigger value="overview" className="!text-sm">
            Overall view
          </TabsTrigger>
          <TabsTrigger value="detail" className="!text-sm">
            Detail view
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <ul className="space-y-3">
            {answers.map((a) => {
              const q = a.question;
              const maxPts = q?.points ?? 0;
              const label =
                q?.body_plaintext?.trim() ||
                (q?.id != null ? `Question ${q.id}` : "Question");
              return (
                <li
                  key={a.id}
                  className="bg-surface-sunken/30 rounded-md border p-3 text-sm"
                >
                  <p className="line-clamp-2 font-medium break-words">
                    {label}
                  </p>
                  <p className="text-text-muted mt-1">
                    Score:{" "}
                    {inProgress
                      ? "In progress"
                      : formatQuizScorePair(a.score, maxPts)}
                  </p>
                </li>
              );
            })}
          </ul>
        </TabsContent>

        <TabsContent value="detail" className="mt-4 space-y-4">
          {answers.map((a) => {
            const q = a.question;
            if (!q || q.id == null) {
              return (
                <div
                  key={a.id}
                  className="text-text-muted rounded-md border p-3 text-sm"
                >
                  Question data missing for this answer.
                </div>
              );
            }
            return (
              <AttemptQuestionReadonly
                key={a.id}
                question={q as QuestionTypeV3}
                selectedOptionIds={a.selected_option_ids ?? []}
                responseText={a.response_text}
                answerScore={a.score}
                maxPoints={q.points ?? 0}
                inProgress={inProgress}
                essayFeedbackDoc={
                  q.question_type === QuestionType.Essay ? a.feedback : undefined
                }
                essayComments={
                  q.question_type === QuestionType.Essay ? a.comments : undefined
                }
              />
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
