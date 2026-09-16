"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { Quiz } from "../_types/quizzes";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { quizzesSearch } from "../resources/quizzes";

export type UseQuizzesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useQuizzesList(
  args: UseQuizzesListArgs,
): ResourceListResult<Quiz> {
  return useSearchListQuery(quizzesSearch, args);
}
