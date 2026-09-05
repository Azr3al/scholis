import { acceptableAnswerToPlainText } from "@/helpers/quizFillBlankAcceptableText";
import { sanitizeQuizTiptapDoc } from "@/helpers/quizTiptapSanitize";
import {
  FillBlankAnswerMode,
  QuestionType,
  type QuestionTypeV3,
} from "@/types/quiz-v3";

export function buildEditorSyncQuestionPayload(
  quizId: number,
  q: QuestionTypeV3,
  displayOrder: number,
): Record<string, unknown> {
  const baseMeta: Record<string, unknown> = {
    quiz: quizId,
    question_type: q.question_type,
    body: sanitizeQuizTiptapDoc(q.body ?? {}),
    body_plaintext: q.body_plaintext ?? "",
    points: q.points,
    display_order: displayOrder,
    is_case_sensitive: !!q.is_case_sensitive,
  };
  if (typeof q.id === "number") {
    baseMeta.id = q.id;
  }
  if (q.question_type === QuestionType.FillInBlank) {
    return {
      ...baseMeta,
      is_partial_scoring_enabled: false,
      options: [] as {
        id?: number;
        body: unknown;
        is_correct: boolean;
        display_order: number;
      }[],
      fill_blank_slots: (q.fill_blank_slots ?? []).map((slot, si) => {
        const mode =
          slot.answer_mode === FillBlankAnswerMode.SingleChoice
            ? FillBlankAnswerMode.SingleChoice
            : FillBlankAnswerMode.Typed;
        const base: Record<string, unknown> = {
          ...(typeof slot.id === "number" ? { id: slot.id } : {}),
          blank_uuid: slot.blank_uuid,
          points: Math.max(1, slot.points ?? 1),
          display_order: si,
          answer_mode: mode,
        };
        if (mode === FillBlankAnswerMode.SingleChoice) {
          base.single_choice_updated_at =
            slot.single_choice_config_at ?? new Date().toISOString();
          return {
            ...base,
            acceptable_answers: [] as {
              id?: number;
              body: string;
              display_order: number;
            }[],
            choice_options: (slot.choice_options ?? []).map((o, j) => ({
              ...(typeof o.id === "number" ? { id: o.id } : {}),
              text: o.text,
              is_correct: !!o.is_correct,
              display_order: j,
            })),
          };
        }
        base.typed_updated_at =
          slot.typed_config_at ?? new Date().toISOString();
        return {
          ...base,
          choice_options: [] as {
            id?: number;
            text: string;
            is_correct: boolean;
            display_order: number;
          }[],
          acceptable_answers: (slot.acceptable_answers ?? []).map((a, j) => ({
            ...(typeof a.id === "number" ? { id: a.id } : {}),
            body: acceptableAnswerToPlainText(a.body ?? ""),
            display_order: j,
          })),
        };
      }),
    };
  }

  if (q.question_type === QuestionType.TrueFalse) {
    return {
      ...baseMeta,
      is_partial_scoring_enabled: false,
      is_case_sensitive: false,
      correct_true: q.correct_true,
      options: [],
    };
  }

  if (q.question_type === QuestionType.ShortAnswer) {
    return {
      ...baseMeta,
      is_partial_scoring_enabled: false,
      is_case_sensitive: false,
      options: [],
      short_answer_acceptables: (q.short_answer_acceptables ?? []).map(
        (row, j) => ({
          ...(typeof row.id === "number" ? { id: row.id } : {}),
          body: String(row.body ?? "").trim(),
          display_order: j,
        }),
      ),
    };
  }

  if (q.question_type === QuestionType.Essay) {
    return {
      ...baseMeta,
      is_partial_scoring_enabled: false,
      is_case_sensitive: false,
      options: [],
    };
  }

  return {
    ...baseMeta,
    is_partial_scoring_enabled: !!q.is_partial_scoring_enabled,
    options: q.options.map((o, j) => ({
      ...(typeof o.id === "number" ? { id: o.id } : {}),
      body: sanitizeQuizTiptapDoc(o.body ?? {}),
      is_correct: !!o.is_correct,
      display_order: j,
    })),
  };
}
