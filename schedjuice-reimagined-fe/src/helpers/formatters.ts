import { roundNumber } from "./number";

/** Two-decimal score display for quiz totals, e.g. 1.00/2.00 */
/** Human-readable lateness for quiz attempts (from `overdue_seconds`). */
export function formatQuizAttemptOverdue(overdueSeconds: number): string {
  const s = Math.max(0, Math.floor(Number(overdueSeconds) || 0));
  if (s === 0) return "On time";
  if (s < 60) return `${s}s late`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) {
    return rem > 0 ? `${m}m ${rem}s late` : `${m}m late`;
  }
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m late` : `${h}h late`;
}

export function formatQuizScorePair(
  userScore: number | string,
  maxScore: number | string,
): string {
  const u = Number(userScore);
  const m = Number(maxScore);
  const safeU = Number.isFinite(u) ? u : 0;
  const safeM = Number.isFinite(m) ? m : 0;
  return `${safeU.toFixed(2)}/${safeM.toFixed(2)}`;
}

export const formatUserScore = (
  availableScore: number | string,
  userScore: number | string | undefined | null = undefined
) => {
  if (userScore !== undefined || userScore !== null) {
    if (availableScore !== 0) {
      userScore = Number(userScore);
      availableScore = Number(availableScore);
      return `${userScore}/${availableScore} (${roundNumber(
        (userScore / availableScore) * 100
      )}%)`;
    }
    return `${userScore}/${availableScore}`;
  }
  return "Unmarked";
};

export function snakeToTitle(input: string): string {
  return input
    .split('_')
    .filter(Boolean) // remove empty segments if there are multiple underscores
    .map(
      word =>
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
    )
    .join(' ');
}
