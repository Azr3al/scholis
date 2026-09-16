import { useQuizV3EditorStore } from "@/store/quiz-v3";
import type { QuestionTypeV3, QuizTypeV3 } from "@/types/quiz-v3";

/**
 * Syncs server quiz + questions into the editor store, preserving local unsaved
 * questions appended beyond the server list (same rules as the former QuizEditor effect).
 * Skips wholesale replace while meta is being edited, and refreshes only quiz metadata
 * while question content is dirty so refetches do not wipe in-progress edits.
 */
export function hydrateQuizV3EditorStore(
  initialQuiz: QuizTypeV3,
  initialQuestions: QuestionTypeV3[],
) {
  const {
    quiz: storeQuiz,
    questions: cur,
    isDirty: wasContentDirty,
    isMetaDirty,
    setFromApi,
    setDirty,
    applyServerQuizMetaOnly,
  } = useQuizV3EditorStore.getState();

  /** Dirty/meta skips below only apply while staying on the same quiz; opening another quiz must replace everything. */
  const switchedQuiz = storeQuiz?.id !== initialQuiz.id;

  if (switchedQuiz) {
    setFromApi(initialQuiz, initialQuestions);
    return;
  }

  if (isMetaDirty) {
    return;
  }

  if (wasContentDirty) {
    applyServerQuizMetaOnly(initialQuiz);
    return;
  }

  if (cur.length > initialQuestions.length) {
    const tail = cur.slice(initialQuestions.length);
    const merged = [...initialQuestions, ...tail];
    const hasUnsavedTail = tail.some((q) => q.id == null);
    setFromApi(initialQuiz, merged);
    if (hasUnsavedTail) setDirty(true);
    return;
  }
  setFromApi(initialQuiz, initialQuestions);
}
