import type { SearchListArgs } from "../core/define-search-list";
import { coursesSearch } from "../resources/courses";

export type CoursesListKeyArgs = SearchListArgs;

export const coursesKeys = coursesSearch.keys;
