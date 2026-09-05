"use client";

import {
  getAxiosResponseStatus,
  parseQuizV3TakeStudentMessage,
} from "@/helpers/quiz-v3-api-error";

function titleForQuizTakeError(status: number | undefined): string {
  if (status === 403) return "You can't open this quiz";
  if (status === 404) return "This quiz wasn't found";
  if (status === 401) return "Sign-in required";
  return "This quiz isn't available";
}

type Props = {
  /** Request/network error from axios; omit when only showing `fallback`. */
  error?: unknown;
  fallback: string;
};

/**
 * Prominent learner-facing error on quiz take routes (403 enrollment, invalid link, etc.).
 */
export function QuizTakeFetchError({ error, fallback }: Props) {
  const status = error !== undefined ? getAxiosResponseStatus(error) : undefined;
  const message =
    error !== undefined
      ? parseQuizV3TakeStudentMessage(error, fallback)
      : fallback;
  const title = titleForQuizTakeError(status);

  return (
    <div
      role="alert"
      className="border-destructive/30 bg-danger/5 rounded-lg border px-4 py-3"
    >
      <p className="text-text-primary font-semibold">{title}</p>
      <p className="text-text-muted mt-2 text-sm leading-relaxed">
        {message}
      </p>
    </div>
  );
}
