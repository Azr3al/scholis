import type { JSONContent } from "@tiptap/core";
import { listQuizFillBlankIdsInOrder } from "@/helpers/quizFillBlankDoc";
import {
  FillBlankAnswerMode,
  type FillBlankSlotType,
  type QuestionTypeV3,
} from "@/types/quiz-v3";

function defaultAcceptableAnswers(): FillBlankSlotType["acceptable_answers"] {
  return [
    { body: "", display_order: 0 },
    { body: "", display_order: 1 },
  ];
}

/** After prompt doc changes, align `fill_blank_slots` to blank ids in document order. */
export function mergeFillBlankSlotsWithPrompt(
  q: QuestionTypeV3,
  body: JSONContent,
  body_plaintext: string,
): QuestionTypeV3 {
  const ids = listQuizFillBlankIdsInOrder(body);
  const prev = q.fill_blank_slots ?? [];
  const byId = new Map(prev.map((s) => [s.blank_uuid, s]));

  const fill_blank_slots: FillBlankSlotType[] = ids.map((blank_uuid, i) => {
    const existing = byId.get(blank_uuid);
    if (existing) {
      return {
        ...existing,
        blank_uuid,
        display_order: i,
      };
    }
    return {
      blank_uuid,
      points: 1,
      display_order: i,
      answer_mode: FillBlankAnswerMode.Typed,
      acceptable_answers: defaultAcceptableAnswers(),
    };
  });

  const points = Math.max(
    1,
    fill_blank_slots.reduce((s, slot) => s + (slot.points ?? 1), 0),
  );

  return {
    ...q,
    body,
    body_plaintext,
    fill_blank_slots,
    points,
  };
}
