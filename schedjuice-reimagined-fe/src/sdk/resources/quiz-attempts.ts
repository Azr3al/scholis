import type { QuizAttempt } from "../_types/quiz-attempts";
import { unwrapList, type SchedjuiceListEnvelope } from "../core/envelope";
import { searchPath } from "../core/http";
import {
  listKeyPayload,
  toFilterBody,
  toSearchQueryParams,
  type SdkListArgs,
} from "../core/list-args";

export type ListQuizAttemptsArgs = SdkListArgs & {
  quizId: number;
};

export const quizAttemptsKeys = {
  all: (quizId: number) => [`quizzes/${quizId}/attempts`] as const,
  lists: (quizId: number) => [...quizAttemptsKeys.all(quizId), "list"] as const,
  list: (args: ListQuizAttemptsArgs) =>
    [...quizAttemptsKeys.lists(args.quizId), listKeyPayload(args)] as const,
};

/** Nested quiz-v3 attempts search: POST `quizzes/:id/attempts/search`. */
export async function listQuizAttempts(
  args: ListQuizAttemptsArgs,
): Promise<{ rows: QuizAttempt[]; total: number }> {
  const { quizId, ...listArgs } = args;
  const res = await searchPath<SchedjuiceListEnvelope<QuizAttempt>>(
    `quizzes/${quizId}/attempts/search`,
    toSearchQueryParams(listArgs),
    toFilterBody(listArgs),
  );
  return unwrapList<QuizAttempt>(res, { pageSize: listArgs.pageSize });
}
