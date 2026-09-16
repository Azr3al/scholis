import type { SearchListArgs } from "../core/define-search-list";
import { userCoursesSearch } from "../resources/user-courses";

export type UserCoursesListKeyArgs = SearchListArgs;

export const userCoursesKeys = userCoursesSearch.keys;
