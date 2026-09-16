/** True when the learner has not submitted the attempt yet. */
export function isQuizAttemptInProgress(attempt: {
  submitted_at?: string | null;
}): boolean {
  return !attempt.submitted_at;
}

/**
 * Earned score for display: sum of AttemptAnswer scores when rows are present,
 * else aggregate `attempt.score` (handles stale totals on QuizAttempt).
 */
export function quizAttemptEarnedScoreDisplay(attempt: {
  score?: string | number | null;
  answers?: { score?: string | number | null }[] | null;
}): string {
  const rows = attempt.answers;
  if (Array.isArray(rows) && rows.length > 0) {
    const sum = rows.reduce((acc, a) => acc + Number(a.score ?? 0), 0);
    return String(sum);
  }
  if (attempt.score === null || attempt.score === undefined) return "";
  return String(attempt.score);
}
