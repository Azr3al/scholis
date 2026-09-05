import type { QuestionTypeV3, QuizTakeSavedAnswers } from "@/types/quiz-v3";
import { hydrateAnswerForQuestion } from "./quiz-taker-progress-payload";
import type { QuizQuestionPlayerAnswerValue } from "./use-quiz-question-player-answers";

export const QUIZ_V3_AUTOSAVE_MIRROR_PREFIX = "quiz-v3-autosave";

export function quizAutosaveMirrorKey(code: string, attemptId: number): string {
  return `${QUIZ_V3_AUTOSAVE_MIRROR_PREFIX}-${code}-${attemptId}`;
}

export type LocalMirror = {
  attempt_id: number;
  answers: Record<string, QuizTakeSavedAnswers[string]>;
  marked_review: Record<string, boolean>;
  written_at: number;
  server_synced_at: number | null;
};

function isLocalMirror(v: unknown): v is LocalMirror {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.attempt_id === "number" &&
    typeof o.written_at === "number" &&
    (typeof o.server_synced_at === "number" ||
      o.server_synced_at === null) &&
    typeof o.answers === "object" &&
    o.answers !== null &&
    !Array.isArray(o.answers) &&
    typeof o.marked_review === "object" &&
    o.marked_review !== null &&
    !Array.isArray(o.marked_review)
  );
}

export function readMirror(
  storage: Storage,
  code: string,
  attemptId: number,
): LocalMirror | null {
  try {
    const raw = storage.getItem(quizAutosaveMirrorKey(code, attemptId));
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLocalMirror(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeMirror(
  storage: Storage,
  code: string,
  attemptId: number,
  patch: LocalMirror,
): void {
  try {
    storage.setItem(
      quizAutosaveMirrorKey(code, attemptId),
      JSON.stringify(patch),
    );
  } catch {
    /* quota / privacy mode — swallow per spec */
  }
}

export function clearMirror(
  storage: Storage,
  code: string,
  attemptId: number,
): void {
  try {
    storage.removeItem(quizAutosaveMirrorKey(code, attemptId));
  } catch {
    /* ignore */
  }
}

export function shouldRestoreFromMirror(
  mirror: LocalMirror | null,
  attemptId: number,
): mirror is LocalMirror {
  return (
    mirror != null &&
    mirror.attempt_id === attemptId &&
    mirror.written_at > (mirror.server_synced_at ?? 0)
  );
}

export function markedReviewFromMirror(mirror: LocalMirror): Record<
  number,
  boolean
> {
  const out: Record<number, boolean> = {};
  for (const [k, v] of Object.entries(mirror.marked_review)) {
    const n = Number.parseInt(k, 10);
    if (!Number.isNaN(n)) out[n] = Boolean(v);
  }
  return out;
}

/** Build player-shape answers from wire-format mirror keyed by question id string. */
export function answersFromMirrorToPlayer(
  questions: QuestionTypeV3[],
  mirror: LocalMirror,
): Record<number, QuizQuestionPlayerAnswerValue> {
  const out: Record<number, QuizQuestionPlayerAnswerValue> = {};
  for (const q of questions) {
    if (!q.id) continue;
    const raw = mirror.answers[String(q.id)];
    const h = hydrateAnswerForQuestion(q, raw);
    if (h !== undefined) out[q.id] = h;
  }
  return out;
}
