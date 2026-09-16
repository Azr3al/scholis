"use client";
import { Button } from "@/components/primitives";

import { QuestionDisplay } from "@/components/quiz-v3/taker/question-display";
import { QuestionNavPanel } from "@/components/quiz-v3/taker/question-nav-panel";
import type { QuestionTypeV3 } from "@/types/quiz-v3";
import { ArrowLeft } from "iconoir-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type QuizQuestionPlayerLayoutProps = {
  questions: QuestionTypeV3[];
  currentIndex: number;
  answered: boolean[];
  markedForReview?: boolean[];
  onGoToIndex: (i: number) => void;
  canNavigateQuestions: boolean;
  maxReachableIndex: number;
  /** Multiple choice selected option IDs. */
  selectedIds: number[];
  /** MCQ / FiB change handlers (usually wrap lifted `set*` with `current`). */
  onChoiceChange: (ids: number[]) => void;
  onFillAnswerChange: (blankUuid: string, text: string) => void;
  /** Fill-in-blank blanks map (parent derives from lifted answers). */
  fillAnswers: Record<string, string>;
  /** True/false learner choice; omit selection when unset. */
  trueFalseChoice: boolean | undefined;
  onTrueFalseChoice: (v: boolean) => void;
  shortOrEssayText: string;
  onShortOrEssayChange: (t: string) => void;
  atLastQuestion: boolean;
  /** Shown above the grid (e.g. quiz title in preview). */
  header?: ReactNode;
  /** Muted helper under header (preview-only copy). */
  helperText?: ReactNode;
  /** Toolbar inside the question card above the prompt (e.g. mark-for-review). */
  cardToolbar?: ReactNode;
  /** Right-hand footer action when not on last question (usually “Next” with arrow). */
  nextTrailing: ReactNode;
  /** Right-hand footer action on last question (“Finish” / “View end screen”). */
  lastTrailing: ReactNode;
  /** Extra classes on the previous / nav footer row (e.g. mobile sticky bottom). */
  footerClassName?: string;
};

/**
 * Shared questions-step grid: nav rail + card + previous / counter / trailing.
 */
export function QuizQuestionPlayerLayout({
  questions,
  currentIndex,
  answered,
  markedForReview,
  onGoToIndex,
  canNavigateQuestions,
  maxReachableIndex,
  onChoiceChange,
  onFillAnswerChange,
  selectedIds,
  fillAnswers,
  trueFalseChoice,
  onTrueFalseChoice,
  shortOrEssayText,
  onShortOrEssayChange,
  atLastQuestion,
  header,
  helperText,
  cardToolbar,
  nextTrailing,
  lastTrailing,
  footerClassName,
}: QuizQuestionPlayerLayoutProps) {
  const current = questions[currentIndex];

  return (
    <div className="space-y-4">
      {header}
      {helperText}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:items-start md:gap-4">
        <QuestionNavPanel
          total={questions.length}
          currentIndex={currentIndex}
          answered={answered}
          markedForReview={markedForReview}
          onGoTo={onGoToIndex}
          canNavigateQuestions={canNavigateQuestions}
          maxReachableIndex={maxReachableIndex}
        />
        <div className="min-w-0 space-y-4">
          {current && (
            <div className="rounded-lg border border-border bg-surface text-text-primary">
              <div className="p-6 pt-0 space-y-3 pt-6">
                {cardToolbar ? <div className="flex justify-end">{cardToolbar}</div> : null}
                <QuestionDisplay
                  question={current}
                  selectedIds={selectedIds}
                  fillAnswers={fillAnswers}
                  onChoiceChange={onChoiceChange}
                  onFillAnswerChange={onFillAnswerChange}
                  trueFalseChoice={trueFalseChoice}
                  onTrueFalseChoice={onTrueFalseChoice}
                  shortOrEssayText={shortOrEssayText}
                  onShortOrEssayChange={onShortOrEssayChange}
                />
              </div>
            </div>
          )}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2",
              footerClassName,
            )}
          >
            <Button
              type="button"
              variant="secondary"
              disabled={currentIndex <= 0}
              className="min-h-11 touch-manipulation cursor-pointer"
              onClick={() => onGoToIndex(currentIndex - 1)}
            >
              <ArrowLeft className="size-4" />
              Previous
            </Button>
            <span className="text-text-muted text-sm">
              Question {currentIndex + 1} of {questions.length || 1}
            </span>
            {!atLastQuestion ? nextTrailing : lastTrailing}
          </div>
        </div>
      </div>
    </div>
  );
}
