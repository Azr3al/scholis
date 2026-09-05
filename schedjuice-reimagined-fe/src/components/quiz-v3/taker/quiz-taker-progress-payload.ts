import {
  QuizTakeSavedAnswers,
  QuestionType,
  type QuestionTypeV3,
} from "@/types/quiz-v3";
import type { QuizQuestionPlayerAnswerValue } from "./use-quiz-question-player-answers";

export function hydrateAnswerForQuestion(
  q: QuestionTypeV3,
  raw: unknown,
): QuizQuestionPlayerAnswerValue | undefined {
  if (raw == null) return undefined;
  if (q.question_type === QuestionType.FillInBlank) {
    if (typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, string>;
    }
    return undefined;
  }
  if (q.question_type === QuestionType.TrueFalse) {
    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      typeof (raw as { value?: unknown }).value === "boolean"
    ) {
      return { value: (raw as { value: boolean }).value };
    }
    return undefined;
  }
  if (
    q.question_type === QuestionType.ShortAnswer ||
    q.question_type === QuestionType.Essay
  ) {
    if (typeof raw === "string") return { text: raw };
    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      typeof (raw as { text?: unknown }).text === "string"
    ) {
      return { text: (raw as { text: string }).text };
    }
    return undefined;
  }
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === "number" ? x : Number.parseInt(String(x), 10)))
      .filter((n) => !Number.isNaN(n));
  }
  return undefined;
}

/** Values match backend `_parse_client_answer_for_question` / autosave PATCH. */
export function buildAnswersPayload(
  questions: QuestionTypeV3[],
  answers: Record<number, QuizQuestionPlayerAnswerValue>,
): Record<string, QuizTakeSavedAnswers[string]> {
  const body: Record<string, QuizTakeSavedAnswers[string]> = {};
  for (const q of questions) {
    if (!q.id) continue;
    const v = answers[q.id];

    if (q.question_type === QuestionType.FillInBlank) {
      const raw =
        v && typeof v === "object" && !Array.isArray(v)
          ? (v as Record<string, string>)
          : {};
      body[String(q.id)] = raw;
      continue;
    }

    if (q.question_type === QuestionType.TrueFalse) {
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        typeof (v as { value?: unknown }).value === "boolean"
      ) {
        body[String(q.id)] = {
          value: (v as { value: boolean }).value,
        };
      }
      continue;
    }

    if (
      q.question_type === QuestionType.ShortAnswer ||
      q.question_type === QuestionType.Essay
    ) {
      const text =
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        typeof (v as { text?: unknown }).text === "string"
          ? (v as { text: string }).text
          : "";
      body[String(q.id)] = { text };
      continue;
    }

    body[String(q.id)] = Array.isArray(v) ? v : [];
  }
  return body;
}

export function buildMarkedReviewPayload(
  questions: QuestionTypeV3[],
  markedReview: Record<number, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const q of questions) {
    if (q.id == null) continue;
    out[String(q.id)] = markedReview[q.id] ?? false;
  }
  return out;
}

export type ProgressPatchBody = {
  attempt_id: number;
  answers: Record<string, QuizTakeSavedAnswers[string]>;
  marked_review: Record<string, boolean>;
};
