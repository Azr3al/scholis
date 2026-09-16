"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { QuizQuestion } from "../_types/quiz-questions";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { quizQuestionsSearch } from "../resources/quiz-questions";

export type UseQuizQuestionsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useQuizQuestionsList(
  args: UseQuizQuestionsListArgs,
): ResourceListResult<QuizQuestion> {
  return useSearchListQuery(quizQuestionsSearch, args);
}
