"use client";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/primitives";

import { QuizRichContentHtml } from "@/components/quiz-v3/shared/quiz-rich-content";
import { QuizTakeShell } from "@/components/quiz-v3/shared/quiz-take-shell";
import { QuizQuestionPlayerLayout } from "@/components/quiz-v3/taker/quiz-question-player-layout";
import { useQuizQuestionPlayerAnswers } from "@/components/quiz-v3/taker/use-quiz-question-player-answers";
import { parseQuizV3ApiError } from "@/helpers/quiz-v3-api-error";
import { isQuizV3TiptapDocEmpty } from "@/helpers/quiz-v3-tiptap-empty";
import { parseQuizThemeV3 } from "@/lib/quiz-v3-theme-presets";
import { axiosClient } from "@/lib/api";
import { QuestionType, type QuestionTypeV3 } from "@/types/quiz-v3";
import type { QuizTypeV3 } from "@/types/quiz-v3";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "iconoir-react";
import Link from "next/link";
import { useCallback, useState } from "react";

type AuthorPreviewPayload = QuizTypeV3 & {
  questions: QuestionTypeV3[];
  logo_url?: string | null;
  organization_name?: string | null;
};

type Step = "start" | "questions" | "end";

type Props = { quizId: number };

export function QuizAuthorPreview({ quizId }: Props) {
  const [step, setStep] = useState<Step>("start");
  const [index, setIndex] = useState(0);

  const q = useQuery({
    queryKey: ["quiz-v3-author-preview", quizId],
    queryFn: async () => {
      const res = await axiosClient.get(`quizzes/${quizId}/author-preview`);
      return res.data?.data as AuthorPreviewPayload;
    },
    enabled: Number.isFinite(quizId),
  });

  const data = q.data;
  const theme = parseQuizThemeV3(data?.quiz_theme);
  const questions = data?.questions ?? [];

  const {
    answers,
    answered,
    setChoiceForCurrent,
    setFillForCurrent,
    setTrueFalseForCurrent,
    setOpenTextForCurrent,
  } = useQuizQuestionPlayerAnswers(questions);

  const goToIndex = useCallback(
    (i: number) => {
      const hi = Math.max(questions.length - 1, 0);
      setIndex(Math.min(Math.max(0, i), hi));
    },
    [questions.length],
  );

  const goNextSequential = useCallback(() => {
    if (index >= questions.length - 1) return;
    setIndex((i) => i + 1);
  }, [index, questions.length]);

  const current = questions[index];

  if (q.isLoading) {
    return (
      <QuizTakeShell contextLabel="Preview" theme={theme} isBrandingLoading>
        <p className="text-text-muted text-sm">Loading preview…</p>
      </QuizTakeShell>
    );
  }

  if (q.isError || !data) {
    const msg = q.isError
      ? parseQuizV3ApiError(q.error, "Could not load preview.")
      : "Could not load preview.";
    return (
      <QuizTakeShell contextLabel="Preview" theme={theme}>
        <p className="text-danger text-sm" role="alert">
          {msg}
        </p>
      </QuizTakeShell>
    );
  }

  const intro = data.intro_body;
  const outro = data.outro_body;
  const showIntroBody = !isQuizV3TiptapDocEmpty(intro);
  const showOutroBody = !isQuizV3TiptapDocEmpty(outro);
  const atLastQuestion = index >= questions.length - 1;

  const fillMap =
    current?.id &&
    current.question_type === QuestionType.FillInBlank &&
    answers[current.id] &&
    typeof answers[current.id] === "object" &&
    !Array.isArray(answers[current.id])
      ? (answers[current.id] as Record<string, string>)
      : {};

  const rawPreviewAnswer =
    current?.id != null ? answers[current.id] : undefined;

  let previewTrueFalse: boolean | undefined;
  if (
    current?.question_type === QuestionType.TrueFalse &&
    rawPreviewAnswer &&
    typeof rawPreviewAnswer === "object" &&
    !Array.isArray(rawPreviewAnswer)
  ) {
    const v = (rawPreviewAnswer as { value?: unknown }).value;
    if (typeof v === "boolean") previewTrueFalse = v;
  }

  let previewShortOrEssayText = "";
  if (
    current &&
    (current.question_type === QuestionType.ShortAnswer ||
      current.question_type === QuestionType.Essay) &&
    rawPreviewAnswer &&
    typeof rawPreviewAnswer === "object" &&
    !Array.isArray(rawPreviewAnswer) &&
    typeof (rawPreviewAnswer as { text?: unknown }).text === "string"
  ) {
    previewShortOrEssayText = (rawPreviewAnswer as { text: string }).text;
  }

  return (
    <QuizTakeShell
      contextLabel="Preview"
      theme={theme}
      logoUrl={data.logo_url}
      organizationName={data.organization_name}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border-2 border-amber-500 bg-amber-100 px-3 text-xs font-semibold leading-none text-amber-950 shadow-sm dark:border-amber-400 dark:bg-amber-950/55 dark:text-amber-50">
            Staff preview
          </span>

        </div>
        <Link href={`/quizzes-v3/${quizId}/edit`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-8 w-fit shrink-0 cursor-pointer self-start sm:self-auto")}>Back to edit</Link>
      </div>

      {step === "start" ? (
        <div className="space-y-6">
          <h1 className="text-text-primary text-xl font-semibold tracking-tight">
            {data.title}
          </h1>
          {showIntroBody ? (
            <div className="text-text-primary/90">
              <QuizRichContentHtml value={intro} />
            </div>
          ) : null}
          <Button
            type="button"
            className="cursor-pointer"
            onClick={() => {
              if (questions.length === 0) {
                setStep("end");
              } else {
                setStep("questions");
                setIndex(0);
              }
            }}
          >
            {questions.length === 0 ? "Continue to end screen" : "Continue to questions"}
          </Button>
        </div>
      ) : null}

      {step === "questions" && questions.length > 0 ? (
        <QuizQuestionPlayerLayout
          questions={questions}
          currentIndex={index}
          answered={answered}
          onGoToIndex={goToIndex}
          canNavigateQuestions
          maxReachableIndex={questions.length - 1}
          onChoiceChange={(ids) => setChoiceForCurrent(current, ids)}
          onFillAnswerChange={(u, t) => setFillForCurrent(current, u, t)}
          selectedIds={
            current?.id
              ? Array.isArray(answers[current.id])
                ? (answers[current.id] as number[])
                : []
              : []
          }
          fillAnswers={fillMap}
          trueFalseChoice={previewTrueFalse}
          onTrueFalseChoice={(v) => setTrueFalseForCurrent(current, v)}
          shortOrEssayText={previewShortOrEssayText}
          onShortOrEssayChange={(t) => setOpenTextForCurrent(current, t)}
          atLastQuestion={atLastQuestion}
          header={
            <h1 className="text-text-primary text-lg font-semibold tracking-tight">
              {data.title}
            </h1>
          }
          helperText={
            <p className="text-text-muted text-xs">
              You can jump to any question.
            </p>
          }
          nextTrailing={
            <Button type="button" className="cursor-pointer" onClick={goNextSequential}>
              Next
              <ArrowRight className="size-4" />
            </Button>
          }
          lastTrailing={
            <Button
              type="button"
              className="cursor-pointer"
              onClick={() => setStep("end")}
            >
              View end screen
            </Button>
          }
        />
      ) : null}

      {step === "end" ? (
        <div className="space-y-6">
          <h1 className="text-text-primary text-xl font-semibold tracking-tight">
            After submit
          </h1>
          <p className="text-text-muted text-sm">
            Learners see this screen after they submit (before results), when an outro is
            configured.
          </p>
          {showOutroBody ? (
            <div className="text-text-primary/90">
              <QuizRichContentHtml value={outro} />
            </div>
          ) : (
            <p className="text-text-muted text-sm">
              No outro content — learners go straight to results.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 cursor-pointer"
              onClick={() => {
                setStep("start");
                setIndex(0);
              }}
            >
              Back to start
            </Button>
            {questions.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 cursor-pointer"
                onClick={() => setStep("questions")}
              >
                Back to questions
              </Button>
            ) : null}
            <Link href={`/quizzes-v3/${quizId}/edit`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-8 cursor-pointer")}>Back to edit</Link>
          </div>
        </div>
      ) : null}
    </QuizTakeShell>
  );
}
