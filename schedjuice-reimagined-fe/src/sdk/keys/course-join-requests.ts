import type { SearchListArgs } from "../core/define-search-list";
import { courseJoinRequestsSearch } from "../resources/course-join-requests";

export type CourseJoinRequestsListKeyArgs = SearchListArgs;

export const courseJoinRequestsKeys = courseJoinRequestsSearch.keys;
