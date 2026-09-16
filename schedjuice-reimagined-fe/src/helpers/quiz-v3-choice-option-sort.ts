import type { QuestionTypeV3 } from "@/types/quiz-v3";

/** Stable ordering for SC/MC option lists (`display_order`, then `id`). */
export function sortedQuestionChoiceOptions(question: QuestionTypeV3) {
  return [...question.options].sort((a, b) => {
    const da = a.display_order ?? 0;
    const db = b.display_order ?? 0;
    if (da !== db) return da - db;
    const ia = a.id ?? 0;
    const ib = b.id ?? 0;
    return ia - ib;
  });
}
