import type { Quiz } from "../_types/quizzes";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListQuizzesArgs = SearchListArgs;

export const quizzesSearch = defineSearchListResource<Quiz>({
  path: "quizzes",
  keyNamespace: "quizzes",
});

export const listQuizzes = quizzesSearch.list;
