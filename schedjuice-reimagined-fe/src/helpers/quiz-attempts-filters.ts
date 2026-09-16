import { quizAttemptEarnedScoreDisplay } from "@/helpers/quiz-attempt-score";

/** Row shape from `quizzes/:id/attempts/search` with `expand=user,answers`. */
export type QuizAttemptListRow = {
  id: number;
  started_at?: string;
  submitted_at?: string | null;
  user?: { id?: number; name?: string };
  score?: string | number;
  max_score?: number;
  answers?: { score?: string | number | null }[];
  has_pending_essay_grading?: boolean;
  is_released?: boolean;
  released_at?: string | null;
  essay_grading_waived_at?: string | null;
};

function userKey(row: QuizAttemptListRow): number {
  return row.user?.id ?? -1;
}

function recencyMs(row: QuizAttemptListRow): number {
  if (row.submitted_at) {
    const t = new Date(row.submitted_at).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (row.started_at) {
    const t = new Date(row.started_at).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

/** One row per student: keep the attempt with the latest activity (submitted_at, else started_at). */
export function pickLatestAttemptPerUser(
  rows: QuizAttemptListRow[],
): QuizAttemptListRow[] {
  const byUser = new Map<number, QuizAttemptListRow[]>();
  for (const r of rows) {
    const k = userKey(r);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k)!.push(r);
  }
  const out: QuizAttemptListRow[] = [];
  byUser.forEach((list) => {
    list.sort((a, b) => {
      const ra = recencyMs(a);
      const rb = recencyMs(b);
      if (rb !== ra) return rb - ra;
      return (b.id ?? 0) - (a.id ?? 0);
    });
    const first = list[0];
    if (first) out.push(first);
  });
  return out;
}

/** One row per student: keep the attempt with the highest earned score (tie-break by id). */
export function pickHighestScoreAttemptPerUser(
  rows: QuizAttemptListRow[],
): QuizAttemptListRow[] {
  const byUser = new Map<number, QuizAttemptListRow[]>();
  for (const r of rows) {
    const k = userKey(r);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k)!.push(r);
  }
  const out: QuizAttemptListRow[] = [];
  byUser.forEach((list) => {
    list.sort((a, b) => {
      const sa = Number(quizAttemptEarnedScoreDisplay(a));
      const sb = Number(quizAttemptEarnedScoreDisplay(b));
      if (sb !== sa) return sb - sa;
      return (b.id ?? 0) - (a.id ?? 0);
    });
    const first = list[0];
    if (first) out.push(first);
  });
  return out;
}
