import type { SearchListArgs } from "../core/define-search-list";
import { quizzesSearch } from "../resources/quizzes";

export type QuizzesListKeyArgs = SearchListArgs;

export const quizzesKeys = quizzesSearch.keys;
