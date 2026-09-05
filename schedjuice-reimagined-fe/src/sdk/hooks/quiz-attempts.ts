"use client";

import { useQuery } from "@tanstack/react-query";

import type { ResourceListResult } from "@/components/data-table/types";

import type { QuizAttempt } from "../_types/quiz-attempts";
import {
  listQuizAttempts,
  quizAttemptsKeys,
  type ListQuizAttemptsArgs,
} from "../resources/quiz-attempts";

export type UseQuizAttemptsListArgs = ListQuizAttemptsArgs & {
  enabled?: boolean;
};

export function useQuizAttemptsList(
  args: UseQuizAttemptsListArgs,
): ResourceListResult<QuizAttempt> {
  const { enabled = true, ...listArgs } = args;
  const query = useQuery({
    queryKey: quizAttemptsKeys.list(listArgs),
    queryFn: () => listQuizAttempts(listArgs),
    enabled: enabled && Number.isFinite(listArgs.quizId) && listArgs.quizId > 0,
  });

  return {
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
