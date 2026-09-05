import type { SearchListArgs } from "../core/define-search-list";
import { quizQuestionsSearch } from "../resources/quiz-questions";

export type QuizQuestionsListKeyArgs = SearchListArgs;

export const quizQuestionsKeys = quizQuestionsSearch.keys;
