import type { CourseJoinRequest } from "../_types/course-join-requests";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListCourseJoinRequestsArgs = SearchListArgs;

export const courseJoinRequestsSearch = defineSearchListResource<CourseJoinRequest>({
  path: "course-join-requests",
  keyNamespace: "course-join-requests",
});

export const listCourseJoinRequests = courseJoinRequestsSearch.list;
