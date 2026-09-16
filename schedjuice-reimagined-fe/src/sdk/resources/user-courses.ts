import type { UserCourse } from "../_types/user-courses";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListUserCoursesArgs = SearchListArgs;

export const userCoursesSearch = defineSearchListResource<UserCourse>({
  path: "user-courses",
  keyNamespace: "user-courses",
});

export const listUserCourses = userCoursesSearch.list;
