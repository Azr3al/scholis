"use client";

import { listFillBlankUuidsForTaker } from "@/helpers/quizFillBlankDoc";
import { QuestionType, type QuestionTypeV3 } from "@/types/quiz-v3";
import { useCallback, useMemo, useState } from "react";

export type QuizQuestionPlayerAnswerValue =
  | number[]
  | Record<string, string>
  | { value: boolean }
  | { text: string };

function isKeyedText(v: unknown): v is { text: string } {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "text" in v &&
    typeof (v as { text: unknown }).text === "string"
  );
}

function isKeyedBool(v: unknown): v is { value: boolean } {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "value" in v &&
    typeof (v as { value: unknown }).value === "boolean"
  );
}

/**
 * Local “player” answers + derived `answered` flags for MCQ vs fill-blank (shared by take + author preview).
 */
export function useQuizQuestionPlayerAnswers(questions: QuestionTypeV3[]) {
  const [answers, setAnswers] = useState<
    Record<number, QuizQuestionPlayerAnswerValue>
  >({});

  const answered = useMemo(() => {
    return questions.map((q) => {
      if (!q.id) return false;
      const v = answers[q.id];

      if (q.question_type === QuestionType.FillInBlank) {
        const blanks = listFillBlankUuidsForTaker(q);
        const raw =
          v && typeof v === "object" && !Array.isArray(v)
            ? (v as Record<string, string>)
            : {};
        if (blanks.length === 0) return false;
        return blanks.every((u) => (raw[u] ?? "").trim().length > 0);
      }

      if (q.question_type === QuestionType.TrueFalse) {
        return isKeyedBool(v);
      }

      if (
        q.question_type === QuestionType.ShortAnswer ||
        q.question_type === QuestionType.Essay
      ) {
        return isKeyedText(v) && v.text.trim().length > 0;
      }

      return Array.isArray(v) && v.length > 0;
    });
  }, [questions, answers]);

  const setChoiceForCurrent = useCallback(
    (current: QuestionTypeV3 | undefined, ids: number[]) => {
      if (!current?.id) return;
      setAnswers((prev) => ({ ...prev, [current.id!]: ids }));
    },
    [],
  );

  const setFillForCurrent = useCallback(
    (
      current: QuestionTypeV3 | undefined,
      blankUuid: string,
      text: string,
    ) => {
      if (!current?.id) return;
      setAnswers((prev) => {
        const cur = prev[current.id!];
        const base =
          cur && typeof cur === "object" && !Array.isArray(cur)
            ? { ...(cur as Record<string, string>) }
            : {};
        return {
          ...prev,
          [current.id!]: { ...base, [blankUuid]: text },
        };
      });
    },
    [],
  );

  const setTrueFalseForCurrent = useCallback(
    (current: QuestionTypeV3 | undefined, value: boolean) => {
      if (!current?.id) return;
      setAnswers((prev) => ({ ...prev, [current.id!]: { value } }));
    },
    [],
  );

  const setOpenTextForCurrent = useCallback(
    (current: QuestionTypeV3 | undefined, text: string) => {
      if (!current?.id) return;
      setAnswers((prev) => ({ ...prev, [current.id!]: { text } }));
    },
    [],
  );

  return {
    answers,
    setAnswers,
    answered,
    setChoiceForCurrent,
    setFillForCurrent,
    setTrueFalseForCurrent,
    setOpenTextForCurrent,
  };
}
