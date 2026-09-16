import type { QuizQuestion } from "../_types/quiz-questions";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListQuizQuestionsArgs = SearchListArgs;

export const quizQuestionsSearch = defineSearchListResource<QuizQuestion>({
  path: "quiz-questions",
  keyNamespace: "quiz-questions",
});

export const listQuizQuestions = quizQuestionsSearch.list;
