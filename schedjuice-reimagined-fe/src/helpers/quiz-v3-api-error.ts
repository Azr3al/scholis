/** Parse error body from quiz v3 / utilitas API responses. */
export function parseQuizV3ApiError(
  err: unknown,
  fallback = "Something went wrong.",
): string {
  const ax = err as {
    response?: { data?: { details?: unknown; message?: unknown } };
  };
  const data = ax?.response?.data;
  if (typeof data?.details === "string" && data.details.trim()) {
    return data.details.trim();
  }
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  return fallback;
}

export function getAxiosResponseStatus(err: unknown): number | undefined {
  const s = (err as { response?: { status?: unknown } })?.response?.status;
  return typeof s === "number" && Number.isFinite(s) ? s : undefined;
}

/** Avoid retry spam on definite client failures (403 enrollment, missing quiz, etc.). */
export function quizTakeQueryRetryPredicate(
  failureCount: number,
  err: unknown,
): boolean {
  const s = getAxiosResponseStatus(err);
  if (s === 401 || s === 403 || s === 404) return false;
  return failureCount < 2;
}

const STUDENT_ENROLLMENT_FRIENDLY =
  "You can't open this quiz. If you're a student in this class, contact your teacher.";

function isEnrollmentRelatedDetail(details: string): boolean {
  return /\benrolled\b/i.test(details) && /\bcourse\b/i.test(details);
}

/** Learner take flow: friendly copy for course enrollment / access guards; otherwise server text. */
export function parseQuizV3TakeStudentMessage(
  err: unknown,
  fallback = "Something went wrong.",
): string {
  const ax = err as {
    response?: { status?: number; data?: { details?: unknown } };
  };
  const status = ax?.response?.status;
  const details =
    typeof ax?.response?.data?.details === "string"
      ? ax.response.data.details.trim()
      : "";
  if (status === 403 && details && isEnrollmentRelatedDetail(details)) {
    return STUDENT_ENROLLMENT_FRIENDLY;
  }
  return parseQuizV3ApiError(err, fallback);
}
