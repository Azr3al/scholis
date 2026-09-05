"use client";

import {
  QUIZ_LEARNER_ESSAY_GRADING_HEADLINE,
  QUIZ_LEARNER_SCORE_AFTER_ESSAY_GRADING,
} from "@/helpers/quiz-v3-learner-messages";
import { cn } from "@/lib/utils";

type Props = {
  variant: "card" | "banner";
  className?: string;
};

/**
 * Informative treatment when essay scores are withheld until grading
 * (learners see no numeric score yet).
 */
export function QuizPendingEssayGradingNotice({ variant, className }: Props) {
  const text = (
    <div className="min-w-0 space-y-1.5 text-pretty">
      <p className="text-text-primary text-base font-semibold tracking-tight sm:text-[1.0625rem]">
        {QUIZ_LEARNER_ESSAY_GRADING_HEADLINE}
      </p>
      <p className="text-text-muted text-sm leading-relaxed sm:text-[0.9375rem]">
        {QUIZ_LEARNER_SCORE_AFTER_ESSAY_GRADING}
      </p>
    </div>
  );

  if (variant === "card") {
    return (
      <div
        className={cn(
          "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 mx-auto mt-7 max-w-md duration-300 motion-reduce:animate-none",
          className,
        )}
        role="status"
      >
        <div className="text-center">{text}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 bg-surface-sunken/40 border-border rounded-xl border p-4 duration-300 motion-reduce:animate-none sm:p-5",
        className,
      )}
      role="status"
    >
      {text}
    </div>
  );
}
